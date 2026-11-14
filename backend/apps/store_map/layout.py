"""Read and save a store layout. A designer save replaces the store, door and racks (position, rotation, template) in one
transaction, guarded by `version`; slots follow the rack's template (`templates.py`)."""

from django.db import transaction
from django.utils import timezone

from apps.products.models import Color, Product, ProductMetrics, Variant

from .codes import display_title, short_code
from .errors import Blocked, Conflict, Invalid  # noqa: F401 (re-exported for the views)
from .models import Rack, RackSlot, RackTemplate, SlotProduct, SlotProductHistory, StoreLayout
from .templates import ROTATIONS, create_slots, live_parts, remove_slots, template_footprint, template_payload

STORE_LIMITS = {"width_cm": (400, 6000), "height_cm": (400, 6000)}


# ---------------------------------------------------------------- read


def product_cards(product_ids):
    """{id: {id, title, short_code, color, status}} for the given products, in three queries."""
    ids = {pid for pid in product_ids if pid}
    if not ids:
        return {}
    statuses = dict(ProductMetrics.objects.filter(product_id__in=ids).values_list("product_id", "status"))
    colors = {}
    variants = (
        Variant.objects.filter(product_id__in=ids, deleted_at__isnull=True)
        .exclude(color__code="")
        .exclude(color__isnull=True)
        .order_by("product_id", "id")
        .values_list("product_id", "color__code")
    )
    for pid, code in variants:
        colors.setdefault(pid, code)
    # Many variants carry only a colour name: match it to the colour table by name.
    named = {}
    for pid, name in (
        Variant.objects.filter(product_id__in=ids - colors.keys(), deleted_at__isnull=True).exclude(color_name="")
        .order_by("product_id", "id").values_list("product_id", "color_name")
    ):
        named.setdefault(pid, name.strip())
    if named:
        hexes = dict(Color.objects.filter(name__in=set(named.values())).exclude(code="").values_list("name", "code"))
        colors.update({pid: hexes[name] for pid, name in named.items() if name in hexes})
    colors = {pid: code if code.startswith("#") else f"#{code}" for pid, code in colors.items()}
    return {
        p.id: {
            "id": p.id,
            "title": display_title(p.title) or str(p.id),
            "short_code": short_code(p.id, p.title),
            "color": colors.get(p.id),
            "status": statuses.get(p.id),
        }
        for p in Product.objects.filter(id__in=ids).only("id", "title")
    }


def slot_payload(slot, card):
    return {"id": slot.id, "piece_id": slot.template_piece_id, "arm_id": slot.template_arm_id, "step": slot.step_index, "product": card}


def rack_slots(racks):
    """{rack id: [slot payloads]} for live slots, products included."""
    slots = list(RackSlot.objects.filter(rack__in=racks, deleted_at__isnull=True).order_by("rack_id", "id"))
    assigned = dict(SlotProduct.objects.filter(slot__in=slots).values_list("slot_id", "product_id"))
    cards = product_cards(assigned.values())
    by_rack = {}
    for slot in slots:
        by_rack.setdefault(slot.rack_id, []).append(slot_payload(slot, cards.get(assigned.get(slot.id))))
    return by_rack


def rack_payload(rack, slots, template, pieces, arms):
    return {
        "id": rack.id,
        "code": rack.code,
        "x_cm": rack.x_cm,
        "y_cm": rack.y_cm,
        "rotation": rack.rotation,
        "template_id": rack.template_id,
        "footprint_cm": template_footprint(template, pieces, arms, rack.rotation) if template else None,
        "slots": slots,
    }


def layout_payload(layout):
    if layout is None:
        return None
    templates = list(RackTemplate.objects.filter(layout=layout, deleted_at__isnull=True).order_by("id"))
    pieces, arms = live_parts(templates)
    racks = list(Rack.objects.filter(layout=layout, deleted_at__isnull=True).order_by("id"))
    by_rack = rack_slots(racks)
    by_template = {t.id: t for t in templates}
    uses = {}
    for rack in racks:
        uses[rack.template_id] = uses.get(rack.template_id, 0) + 1
    return {
        "id": layout.id,
        "branch": layout.branch,
        "width_cm": layout.width_cm,
        "height_cm": layout.height_cm,
        "door_side": layout.door_side,
        "door_offset_cm": layout.door_offset_cm,
        "door_width_cm": layout.door_width_cm,
        "version": layout.version,
        "updated_at": layout.updated_at,
        "updated_by": layout.updated_by.username if layout.updated_by else None,
        "templates": [template_payload(t, pieces.get(t.id, []), arms.get(t.id, []), uses.get(t.id, 0)) for t in templates],
        "racks": [
            rack_payload(rack, by_rack.get(rack.id, []), by_template.get(rack.template_id),
                         pieces.get(rack.template_id, []), arms.get(rack.template_id, []))
            for rack in racks
        ],
    }


# ---------------------------------------------------------------- save


def _int(data, key, low, high, default=None):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
        raise Invalid(f"مقدار «{key}» نامعتبر است.")
    value = int(value)
    if not low <= value <= high:
        raise Invalid(f"مقدار «{key}» خارج از محدوده است.")
    return value


def _clean(data):
    """Validate the whole document before touching the database (templates are checked against the layout later)."""
    store = {key: _int(data, key, *limits) for key, limits in STORE_LIMITS.items()}
    store["door_side"] = data.get("door_side", "left")
    if store["door_side"] not in dict(StoreLayout.DOOR_SIDES):
        raise Invalid("سمت ورودی نامعتبر است.")
    edge = store["height_cm"] if store["door_side"] in ("left", "right") else store["width_cm"]
    store["door_width_cm"] = _int(data, "door_width_cm", 50, edge, 150)
    store["door_offset_cm"] = _int(data, "door_offset_cm", 0, edge - store["door_width_cm"], 0)
    racks, codes = [], set()
    for raw in data.get("racks") or []:
        if not isinstance(raw, dict):
            raise Invalid("رگال نامعتبر است.")
        code = str(raw.get("code") or "").strip()[:32]
        if not code:
            raise Invalid("هر رگال کد لازم دارد.")
        if code in codes:
            raise Invalid(f"کد رگال «{code}» تکراری است.")
        codes.add(code)
        template_id = raw.get("template_id")
        if isinstance(template_id, bool) or not isinstance(template_id, int):
            raise Invalid(f"رگال «{code}» قالب ندارد.")
        racks.append({
            "id": raw.get("id"),
            "key": str(raw.get("key") or ""),
            "code": code,
            "x_cm": _int(raw, "x_cm", 0, store["width_cm"]),
            "y_cm": _int(raw, "y_cm", 0, store["height_cm"]),
            "rotation": raw.get("rotation", 0),
            "template_id": template_id,
        })
    return store, racks


def save_layout(branch, data, user):
    """Replace the branch layout with `data` atomically; returns (layout, {client key: rack payload} for new racks)."""
    store, racks = _clean(data)
    with transaction.atomic():
        layout = StoreLayout.objects.select_for_update().filter(branch=branch).first()
        version = data.get("version")
        if layout is None:
            if version not in (None, 0):
                raise Conflict
            layout = StoreLayout(branch=branch, version=0)
        elif version != layout.version:
            raise Conflict
        for key, value in store.items():
            setattr(layout, key, value)
        layout.version += 1
        layout.updated_by = user
        layout.save()

        templates = {t.id: t for t in RackTemplate.objects.filter(layout=layout, deleted_at__isnull=True)} if layout.pk else {}
        pieces, arms = live_parts(templates.values())
        live = {r.id: r for r in Rack.objects.filter(layout=layout, deleted_at__isnull=True)}
        for rack in racks:
            template = templates.get(rack["template_id"])
            if template is None:
                raise Invalid(f"قالب رگال «{rack['code']}» دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
            if rack["rotation"] not in ROTATIONS[template.kind]:
                raise Invalid(f"چرخش رگال «{rack['code']}» برای این قالب مجاز نیست.")
            if rack["id"] is not None:
                if rack["id"] not in live:
                    raise Invalid("یکی از رگال‌ها دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
                if live[rack["id"]].template_id != template.id:
                    raise Invalid(f"قالب رگال «{rack['code']}» عوض نمی‌شود؛ رگال تازه بگذارید.")
        kept = {r["id"] for r in racks if r["id"] is not None}
        gone = [rack for rid, rack in live.items() if rid not in kept]
        remove_slots(list(RackSlot.objects.filter(rack__in=gone, deleted_at__isnull=True)), user)
        Rack.objects.filter(id__in=[r.id for r in gone]).update(deleted_at=timezone.now())
        # Codes may swap between racks: park the kept ones on unique temporary codes first (partial unique index).
        for rid in kept:
            Rack.objects.filter(id=rid).update(code=f"~{rid}")

        created = {}
        for rack in racks:
            fields = {k: rack[k] for k in ("code", "x_cm", "y_cm", "rotation", "template_id")}
            if rack["id"] is None:
                obj = Rack.objects.create(layout=layout, **fields)
                template = templates[rack["template_id"]]
                create_slots(obj, template, pieces.get(template.id, []), arms.get(template.id, []))
                created[rack["key"] or str(obj.id)] = obj
            else:
                Rack.objects.filter(id=rack["id"]).update(**fields, updated_at=timezone.now())
        slots = rack_slots(created.values())
        payload = {
            key: rack_payload(obj, slots.get(obj.id, []), templates[obj.template_id], pieces.get(obj.template_id, []), arms.get(obj.template_id, []))
            for key, obj in created.items()
        }
    return layout, payload


def set_slot_product(slot_id, product_id, user):
    """Put a product on a live slot (or clear it with None); every change writes one history row."""
    with transaction.atomic():
        slot = RackSlot.objects.select_for_update().filter(id=slot_id, deleted_at__isnull=True, rack__deleted_at__isnull=True).first()
        if slot is None:
            return None
        current = SlotProduct.objects.filter(slot=slot).first()
        old = current.product_id if current else None
        if old != product_id:
            if product_id is None:
                current.delete()
            elif current:
                current.product_id, current.assigned_by = product_id, user
                current.save()
            else:
                SlotProduct.objects.create(slot=slot, product_id=product_id, assigned_by=user)
            SlotProductHistory.objects.create(slot=slot, old_product_id=old, new_product_id=product_id,
                                              reason="assign" if product_id else "clear", user=user)
    return slot_payload(slot, product_cards([product_id]).get(product_id))
