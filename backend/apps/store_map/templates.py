"""Rack template rules, all in one place: validation, the floor footprint, slots per rack (one per template element),
syncing every rack when a template changes, and the removals that are blocked while a product sits on them.

Line template: a spine with full pieces (a length ≥ 30 cm) and half pieces (a point) on side a/b; one slot per piece.
Hub template: a post with 1–8 arms at multiples of 45°, 20–90 cm long, 1–5 steps each; one slot per step (step 0 is next
to the post). Template saves share the layout version with the designer (one 409 flow)."""

import math

from django.db import transaction
from django.utils import timezone

from .errors import Blocked, Conflict, Invalid
from .models import Rack, RackSlot, RackTemplate, SlotProduct, SlotProductHistory, StoreLayout, TemplateArm, TemplatePiece

CELL = 50
POST_RADIUS = 6
LINE = {"length_cm": (50, 1200), "arm_cm": (20, 150)}
MIN_FULL = 30
ARM_LENGTH = (20, 90)
ARM_STEPS = (1, 5)
MAX_ARMS = 8
ROTATIONS = {"line": (0, 90), "hub": (0, 90, 180, 270)}
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(n):
    return str(n).translate(FA)


# ---------------------------------------------------------------- geometry


def footprint(kind, rotation, *, length_cm=None, arm_cm=None, sides=2, arms=()):
    """Floor footprint (width, height) in cm on the 50 cm board.

    line: the length and the arm × sides, each rounded up to whole cells (at least 2 × 1), swapped at 90°.
    hub: the bounding box of the rotated arms plus the post radius, rounded up to cells (at least 1 × 1).
    `arms` are (angle_deg, length_cm) pairs; angles turn counter-clockwise from the right, as does the rotation."""
    if kind == "hub":
        xs, ys = [-POST_RADIUS, POST_RADIUS], [-POST_RADIUS, POST_RADIUS]
        for angle, length in arms:
            rad = math.radians(angle + rotation)
            xs.append(math.cos(rad) * length)
            ys.append(math.sin(rad) * length)
        cells = lambda span: max(1, math.ceil((span - 0.01) / CELL))  # noqa: E731
        return cells(max(xs) - min(xs)) * CELL, cells(max(ys) - min(ys)) * CELL
    length = max(2, math.ceil((length_cm or 0) / CELL)) * CELL
    depth = max(1, math.ceil(((arm_cm or 0) * sides) / CELL)) * CELL
    return (depth, length) if rotation % 180 else (length, depth)


def template_footprint(template, pieces, arms, rotation):
    if template.kind == "hub":
        return footprint("hub", rotation, arms=[(a.angle_deg, a.length_cm) for a in arms])
    return footprint("line", rotation, length_cm=template.length_cm, arm_cm=template.arm_cm, sides=len({p.side for p in pieces}) or 2)


# ---------------------------------------------------------------- read


def live_parts(templates):
    """({template id: [pieces]}, {template id: [arms]}) for live elements, in display order."""
    pieces, arms = {}, {}
    for piece in TemplatePiece.objects.filter(template__in=templates, deleted_at__isnull=True).order_by("id"):
        pieces.setdefault(piece.template_id, []).append(piece)
    for arm in TemplateArm.objects.filter(template__in=templates, deleted_at__isnull=True).order_by("id"):
        arms.setdefault(arm.template_id, []).append(arm)
    return pieces, arms


def template_payload(template, pieces, arms, racks):
    return {
        "id": template.id,
        "name": template.name,
        "kind": template.kind,
        "length_cm": template.length_cm,
        "arm_cm": template.arm_cm,
        "pieces": [{"id": p.id, "side": p.side, "kind": p.kind, "offset_cm": p.offset_cm, "length_cm": p.length_cm} for p in pieces],
        "arms": [{"id": a.id, "angle_deg": a.angle_deg, "length_cm": a.length_cm, "steps": a.steps} for a in arms],
        "racks": racks,
    }


# ---------------------------------------------------------------- slots


def _wanted(template, pieces, arms):
    """Template elements as slot keys: ("p", piece id) or ("a", arm id, step)."""
    if template.kind == "hub":
        return [("a", arm.id, step) for arm in arms for step in range(arm.steps)]
    return [("p", piece.id) for piece in pieces]


def _slot_key(slot):
    return ("a", slot.template_arm_id, slot.step_index) if slot.template_arm_id else ("p", slot.template_piece_id)


def _new_slot(rack, key):
    if key[0] == "a":
        return RackSlot(rack=rack, template_arm_id=key[1], step_index=key[2])
    return RackSlot(rack=rack, template_piece_id=key[1])


def create_slots(rack, template, pieces, arms):
    RackSlot.objects.bulk_create([_new_slot(rack, key) for key in _wanted(template, pieces, arms)])


def remove_slots(slots, user):
    """Soft-delete slots; a product on a removed slot is cleared with a `slot_removed` history row."""
    if not slots:
        return
    for assignment in SlotProduct.objects.filter(slot__in=slots):
        SlotProductHistory.objects.create(slot_id=assignment.slot_id, old_product_id=assignment.product_id, reason="slot_removed", user=user)
        assignment.delete()
    RackSlot.objects.filter(id__in=[s.id for s in slots]).update(deleted_at=timezone.now())


def _blocked_message(key, arms_by_id, codes):
    where = f" (رگال {'، '.join(sorted(codes))})"
    if key[0] == "p":
        return f"این تکه روی رگال‌های نقشه کالا دارد{where}. اول کالا را بردارید."
    arm = arms_by_id.get(key[1])
    if arm is not None and arm.deleted_at is None:
        return f"پله {fa(key[2] + 1)} این بازو روی رگال‌های نقشه کالا دارد{where}. اول کالا را بردارید."
    return f"این بازو روی رگال‌های نقشه کالا دارد{where}. اول کالاهایش را بردارید."


def sync_racks(template, user):
    """Make every live rack of the template hold exactly one live slot per template element: create the missing slots,
    soft-delete the extra ones. Raises Blocked (nothing is changed by the caller's transaction) if an extra slot holds a product."""
    pieces, arms = live_parts([template])
    pieces, arms = pieces.get(template.id, []), arms.get(template.id, [])
    wanted = set(_wanted(template, pieces, arms))
    racks = list(Rack.objects.filter(template=template, deleted_at__isnull=True))
    slots = list(RackSlot.objects.filter(rack__in=racks, deleted_at__isnull=True))
    extra = [s for s in slots if _slot_key(s) not in wanted]
    filled = set(SlotProduct.objects.filter(slot__in=extra).values_list("slot_id", flat=True))
    if filled:
        codes = {s.id: s.rack_id for s in extra if s.id in filled}
        first = next(s for s in extra if s.id in filled)
        rack_codes = {r.code for r in racks if r.id in codes.values()}
        arms_by_id = {a.id: a for a in TemplateArm.objects.filter(template=template)}
        raise Blocked(_blocked_message(_slot_key(first), arms_by_id, rack_codes))
    remove_slots(extra, user)
    removed = {s.id for s in extra}
    have = {}
    for slot in slots:
        if slot.id not in removed:
            have.setdefault(slot.rack_id, set()).add(_slot_key(slot))
    RackSlot.objects.bulk_create([_new_slot(rack, key) for rack in racks for key in _wanted(template, pieces, arms) if key not in have.get(rack.id, set())])


# ---------------------------------------------------------------- validation


def _int(data, key, low, high, default=None):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
        raise Invalid(f"مقدار «{key}» نامعتبر است.")
    value = int(value)
    if not low <= value <= high:
        raise Invalid(f"مقدار «{key}» خارج از محدوده است.")
    return value


def clean_template(data, kind):
    name = str(data.get("name") or "").strip()[:64]
    if not name:
        raise Invalid("قالب نام لازم دارد.")
    if kind == "line":
        length = _int(data, "length_cm", *LINE["length_cm"])
        arm = _int(data, "arm_cm", *LINE["arm_cm"])
        pieces = []
        for raw in data.get("pieces") or []:
            if not isinstance(raw, dict) or raw.get("side") not in ("a", "b") or raw.get("kind") not in ("full", "half"):
                raise Invalid("تکه قالب نامعتبر است.")
            full = raw["kind"] == "full"
            piece_length = _int(raw, "length_cm", MIN_FULL, length) if full else None
            pieces.append({"id": raw.get("id"), "key": str(raw.get("key") or ""), "side": raw["side"], "kind": raw["kind"],
                           "offset_cm": _int(raw, "offset_cm", 0, length - (piece_length or 0)), "length_cm": piece_length})
        if not pieces:
            raise Invalid("قالب دست‌کم یک تکه لازم دارد.")
        return {"name": name, "length_cm": length, "arm_cm": arm, "pieces": pieces, "arms": []}
    arms, angles = [], set()
    for raw in data.get("arms") or []:
        if not isinstance(raw, dict):
            raise Invalid("بازوی قالب نامعتبر است.")
        angle = _int(raw, "angle_deg", 0, 315)
        if angle % 45:
            raise Invalid("زاویه بازو باید مضربی از ۴۵ درجه باشد.")
        if angle in angles:
            raise Invalid("دو بازو هم‌جهت نمی‌شوند.")
        angles.add(angle)
        arms.append({"id": raw.get("id"), "key": str(raw.get("key") or ""), "angle_deg": angle,
                     "length_cm": _int(raw, "length_cm", *ARM_LENGTH), "steps": _int(raw, "steps", *ARM_STEPS)})
    if not arms:
        raise Invalid("قالب دست‌کم یک بازو لازم دارد.")
    if len(arms) > MAX_ARMS:
        raise Invalid("قالب حداکثر ۸ بازو دارد.")
    return {"name": name, "length_cm": None, "arm_cm": None, "pieces": [], "arms": arms}


# ---------------------------------------------------------------- save


def _locked_layout(branch, version):
    layout = StoreLayout.objects.select_for_update().filter(branch=branch).first()
    if layout is None:
        raise Invalid("اول نقشه فروشگاه را بسازید.")
    if version != layout.version:
        raise Conflict
    return layout


def _bump(layout, user):
    layout.version += 1
    layout.updated_by = user
    layout.save(update_fields=["version", "updated_by", "updated_at"])


def save_template(branch, template_id, data, user):
    """Create (template_id None) or replace a template and sync its racks, in one transaction under the layout version.
    Returns (layout, template, {client key: new element id})."""
    with transaction.atomic():
        layout = _locked_layout(branch, data.get("version"))
        if template_id is None:
            kind = data.get("kind")
            if kind not in ROTATIONS:
                raise Invalid("نوع قالب نامعتبر است.")
            template = RackTemplate(layout=layout, kind=kind)
        else:
            template = RackTemplate.objects.select_for_update().filter(id=template_id, layout=layout, deleted_at__isnull=True).first()
            if template is None:
                raise Invalid("این قالب دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
        clean = clean_template(data, template.kind)
        template.name, template.length_cm, template.arm_cm = clean["name"], clean["length_cm"], clean["arm_cm"]
        template.save()
        ids = {}
        now = timezone.now()
        if template.kind == "line":
            live = {p.id: p for p in TemplatePiece.objects.filter(template=template, deleted_at__isnull=True)}
            for raw in clean["pieces"]:
                if raw["id"] is not None and raw["id"] not in live:
                    raise Invalid("یکی از تکه‌ها دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
            kept = {raw["id"] for raw in clean["pieces"] if raw["id"] is not None}
            TemplatePiece.objects.filter(id__in=[pid for pid in live if pid not in kept]).update(deleted_at=now)
            for raw in clean["pieces"]:
                fields = {k: raw[k] for k in ("side", "kind", "offset_cm", "length_cm")}
                if raw["id"] is None:
                    piece = TemplatePiece.objects.create(template=template, **fields)
                    if raw["key"]:
                        ids[raw["key"]] = piece.id
                else:
                    TemplatePiece.objects.filter(id=raw["id"]).update(**fields)
        else:
            live = {a.id: a for a in TemplateArm.objects.filter(template=template, deleted_at__isnull=True)}
            for raw in clean["arms"]:
                if raw["id"] is not None and raw["id"] not in live:
                    raise Invalid("یکی از بازوها دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
            kept = {raw["id"] for raw in clean["arms"] if raw["id"] is not None}
            TemplateArm.objects.filter(id__in=[aid for aid in live if aid not in kept]).update(deleted_at=now)
            # Angles may swap between arms: park the kept ones on unused values first (partial unique index).
            for index, aid in enumerate(sorted(kept)):
                TemplateArm.objects.filter(id=aid).update(angle_deg=400 + index)
            for raw in clean["arms"]:
                fields = {k: raw[k] for k in ("angle_deg", "length_cm", "steps")}
                if raw["id"] is None:
                    arm = TemplateArm.objects.create(template=template, **fields)
                    if raw["key"]:
                        ids[raw["key"]] = arm.id
                else:
                    TemplateArm.objects.filter(id=raw["id"]).update(**fields)
        sync_racks(template, user)
        _bump(layout, user)
    return layout, template, ids


def delete_template(branch, template_id, version, user):
    with transaction.atomic():
        layout = _locked_layout(branch, version)
        template = RackTemplate.objects.select_for_update().filter(id=template_id, layout=layout, deleted_at__isnull=True).first()
        if template is None:
            raise Invalid("این قالب دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
        used = Rack.objects.filter(template=template, deleted_at__isnull=True).count()
        if used:
            raise Blocked(f"این قالب در {fa(used)} رگال نقشه استفاده شده است. اول آن رگال‌ها را حذف کنید یا قالب دیگری بگذارید.")
        now = timezone.now()
        TemplatePiece.objects.filter(template=template, deleted_at__isnull=True).update(deleted_at=now)
        TemplateArm.objects.filter(template=template, deleted_at__isnull=True).update(deleted_at=now)
        template.deleted_at = now
        template.save(update_fields=["deleted_at", "updated_at"])
        _bump(layout, user)
    return layout
