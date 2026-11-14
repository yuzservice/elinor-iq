"""Store floor map («فروشگاه»): one layout per branch; every rack is an instance of a rack template (line: a spine with
full/half pieces; hub: a post with stepped arms); each template element gives the rack one slot; one product per slot.

Templates, their elements, racks and slots are soft-deleted (`deleted_at`) so their history rows always keep their target; nothing cascades into
`store_slot_product_history`. Products are referenced without a DB constraint so catalog sync never trips over the map.
"""

from django.conf import settings
from django.db import models

from apps.sales.models import SalesLine


class StoreLayout(models.Model):
    DOOR_SIDES = [("left", "left"), ("right", "right"), ("top", "top"), ("bottom", "bottom")]

    branch = models.CharField(max_length=16, choices=SalesLine.choices, unique=True)
    width_cm = models.PositiveIntegerField()
    height_cm = models.PositiveIntegerField()
    door_side = models.CharField(max_length=8, choices=DOOR_SIDES, default="left")
    door_offset_cm = models.PositiveIntegerField(default=0)  # from the top (left/right sides) or the left (top/bottom)
    door_width_cm = models.PositiveIntegerField(default=150)
    version = models.PositiveIntegerField(default=1)  # optimistic lock: every designer save sends the version it read
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "store_layouts"


class RackTemplate(models.Model):
    KINDS = [("line", "line"), ("hub", "hub")]

    layout = models.ForeignKey(StoreLayout, on_delete=models.PROTECT, related_name="templates")
    name = models.CharField(max_length=64)
    kind = models.CharField(max_length=4, choices=KINDS)
    length_cm = models.PositiveIntegerField(null=True, blank=True)  # line only
    arm_cm = models.PositiveIntegerField(null=True, blank=True)  # line only: depth of one side
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "store_rack_templates"


class TemplatePiece(models.Model):
    """Line template element: a full piece (with a length) or a half piece (a point) on side a or b."""

    template = models.ForeignKey(RackTemplate, on_delete=models.PROTECT, related_name="pieces")
    side = models.CharField(max_length=1, choices=[("a", "a"), ("b", "b")])
    kind = models.CharField(max_length=4, choices=[("full", "full"), ("half", "half")])
    offset_cm = models.PositiveIntegerField()  # from the rack's right end
    length_cm = models.PositiveIntegerField(null=True, blank=True)  # full only
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "store_template_pieces"


class TemplateArm(models.Model):
    """Hub template element: an arm from the post at `angle_deg` (0 = right, counter-clockwise), stepped; one slot per step."""

    template = models.ForeignKey(RackTemplate, on_delete=models.PROTECT, related_name="arms")
    angle_deg = models.PositiveSmallIntegerField()  # 0–315, multiples of 45
    length_cm = models.PositiveSmallIntegerField()  # 20–90
    steps = models.PositiveSmallIntegerField()  # 1–5
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "store_template_arms"
        constraints = [
            models.UniqueConstraint(fields=["template", "angle_deg"], condition=models.Q(deleted_at__isnull=True), name="store_arm_angle_unique_live"),
        ]


class Rack(models.Model):
    ROTATIONS = [(0, "0"), (90, "90"), (180, "180"), (270, "270")]  # 180/270: hub templates only

    layout = models.ForeignKey(StoreLayout, on_delete=models.PROTECT, related_name="racks")
    template = models.ForeignKey(RackTemplate, null=True, blank=True, on_delete=models.PROTECT, related_name="racks")
    code = models.CharField(max_length=32)
    x_cm = models.IntegerField()
    y_cm = models.IntegerField()
    rotation = models.PositiveSmallIntegerField(choices=ROTATIONS, default=0)
    length_cm = models.PositiveIntegerField(null=True, blank=True)  # before templates (0002); no longer read
    arm_cm = models.PositiveIntegerField(null=True, blank=True)  # before templates (0002); no longer read
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "store_racks"
        constraints = [
            models.UniqueConstraint(fields=["layout", "code"], condition=models.Q(deleted_at__isnull=True), name="store_rack_code_unique_live"),
        ]


class RackSlot(models.Model):
    SIDES = [("a", "a"), ("b", "b")]
    KINDS = [("full", "full"), ("half", "half")]

    rack = models.ForeignKey(Rack, on_delete=models.PROTECT, related_name="slots")
    # The template element this slot comes from: a line piece, or a hub arm step (0 = next to the post).
    template_piece = models.ForeignKey(TemplatePiece, null=True, blank=True, on_delete=models.PROTECT, related_name="slots")
    template_arm = models.ForeignKey(TemplateArm, null=True, blank=True, on_delete=models.PROTECT, related_name="slots")
    step_index = models.PositiveSmallIntegerField(null=True, blank=True)
    # Geometry before templates (0002); kept for history, no longer read.
    side = models.CharField(max_length=1, choices=SIDES, blank=True, null=True)
    kind = models.CharField(max_length=4, choices=KINDS, blank=True, null=True)
    offset_cm = models.PositiveIntegerField(null=True, blank=True)
    length_cm = models.PositiveIntegerField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "store_rack_slots"


class SlotProduct(models.Model):
    slot = models.OneToOneField(RackSlot, on_delete=models.PROTECT, related_name="assignment")
    product = models.ForeignKey("products.Product", on_delete=models.DO_NOTHING, db_constraint=False, related_name="+")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    assigned_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "store_slot_products"


class SlotProductHistory(models.Model):
    REASONS = [("assign", "assign"), ("clear", "clear"), ("slot_removed", "slot_removed")]

    slot = models.ForeignKey(RackSlot, on_delete=models.PROTECT, related_name="history")
    old_product = models.ForeignKey("products.Product", null=True, blank=True, on_delete=models.DO_NOTHING, db_constraint=False, related_name="+")
    new_product = models.ForeignKey("products.Product", null=True, blank=True, on_delete=models.DO_NOTHING, db_constraint=False, related_name="+")
    reason = models.CharField(max_length=16, choices=REASONS)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "store_slot_product_history"
        ordering = ["-at", "-id"]
