"""Store floor map («فروشگاه»): one layout per branch, racks with full/half pieces (slots), one product per slot.

Racks and slots are soft-deleted (`deleted_at`) so their history rows always keep their target; nothing cascades into
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


class Rack(models.Model):
    layout = models.ForeignKey(StoreLayout, on_delete=models.PROTECT, related_name="racks")
    code = models.CharField(max_length=32)
    x_cm = models.IntegerField()
    y_cm = models.IntegerField()
    rotation = models.PositiveSmallIntegerField(choices=[(0, "0"), (90, "90")], default=0)
    length_cm = models.PositiveIntegerField()
    arm_cm = models.PositiveIntegerField()  # depth of one side
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
    side = models.CharField(max_length=1, choices=SIDES)
    kind = models.CharField(max_length=4, choices=KINDS)
    offset_cm = models.PositiveIntegerField()  # from the rack's right end
    length_cm = models.PositiveIntegerField(null=True, blank=True)  # full pieces only
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
