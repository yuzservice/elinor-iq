"""Read and save a store layout. A designer save replaces the whole layout in one transaction, guarded by `version`."""

from django.db import transaction
from django.utils import timezone

from apps.products.models import Product, ProductMetrics, Variant

from .codes import display_title, short_code
from .models import Rack, RackSlot, SlotProduct, SlotProductHistory, StoreLayout

STORE_LIMITS = {"width_cm": (400, 6000), "height_cm": (400, 6000)}
RACK_LIMITS = {"length_cm": (50, 1200), "arm_cm": (20, 150)}
MIN_FULL_CM = 30


class Conflict(Exception):
    """The layout changed since the client read it."""


class Invalid(Exception):
    pass


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
        colors.setdefault(pid, code if code.startswith("#") else f"#{code}")
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
    return {
        "id": slot.id,
        "side": slot.side,
        "kind": slot.kind,
        "offset_cm": slot.offset_cm,
        "length_cm": slot.length_cm,
        "product": card,
    }


def layout_payload(layout):
    if layout is None:
        return None
    racks = list(Rack.objects.filter(layout=layout, deleted_at__isnull=True).order_by("id"))
    slots = list(RackSlot.objects.filter(rack__in=racks, deleted_at__isnull=True).order_by("rack_id", "id"))
    assigned = dict(SlotProduct.objects.filter(slot__in=slots).values_list("slot_id", "product_id"))
    cards = product_cards(assigned.values())
    by_rack = {}
    for slot in slots:
        by_rack.setdefault(slot.rack_id, []).append(slot_payload(slot, cards.get(assigned.get(slot.id))))
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
        "racks": [
            {
                "id": rack.id,
                "code": rack.code,
                "x_cm": rack.x_cm,
                "y_cm": rack.y_cm,
                "rotation": rack.rotation,
                "length_cm": rack.length_cm,
                "arm_cm": rack.arm_cm,
                "slots": by_rack.get(rack.id, []),
            }
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
    """Validate the whole document before touching the database."""
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
        rack = {
            "id": raw.get("id"),
            "key": str(raw.get("key") or ""),
            "code": code,
            "x_cm": _int(raw, "x_cm", 0, store["width_cm"]),
            "y_cm": _int(raw, "y_cm", 0, store["height_cm"]),
            "rotation": raw.get("rotation", 0),
            "length_cm": _int(raw, "length_cm", *RACK_LIMITS["length_cm"]),
            "arm_cm": _int(raw, "arm_cm", *RACK_LIMITS["arm_cm"]),
            "slots": [],
        }
        if rack["rotation"] not in (0, 90):
            raise Invalid("چرخش رگال فقط ۰ یا ۹۰ درجه است.")
        for slot_raw in raw.get("slots") or []:
            if not isinstance(slot_raw, dict) or slot_raw.get("side") not in ("a", "b") or slot_raw.get("kind") not in ("full", "half"):
                raise Invalid(f"جایگاه رگال «{code}» نامعتبر است.")
            full = slot_raw["kind"] == "full"
            length = _int(slot_raw, "length_cm", MIN_FULL_CM, rack["length_cm"]) if full else None
            offset = _int(slot_raw, "offset_cm", 0, rack["length_cm"] - (length or 0))
            rack["slots"].append({"id": slot_raw.get("id"), "key": str(slot_raw.get("key") or ""), "side": slot_raw["side"],
                                  "kind": slot_raw["kind"], "offset_cm": offset, "length_cm": length})
        racks.append(rack)
    return store, racks


def _remove_slots(slots, user):
    """Soft-delete slots; a product on a removed slot is cleared with a history row."""
    if not slots:
        return
    now = timezone.now()
    for assignment in SlotProduct.objects.filter(slot__in=slots):
        SlotProductHistory.objects.create(slot_id=assignment.slot_id, old_product_id=assignment.product_id, reason="slot_removed", user=user)
        assignment.delete()
    RackSlot.objects.filter(id__in=[s.id for s in slots]).update(deleted_at=now)


def save_layout(branch, data, user):
    """Replace the branch layout with `data` atomically; returns (layout, {client key: new id})."""
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

        live = {r.id: r for r in Rack.objects.filter(layout=layout, deleted_at__isnull=True)}
        live_slots = {}
        for slot in RackSlot.objects.filter(rack__in=live.values(), deleted_at__isnull=True):
            live_slots[slot.id] = slot
        for rack in racks:
            if rack["id"] is not None and rack["id"] not in live:
                raise Invalid("یکی از رگال‌ها دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
        kept = {r["id"] for r in racks if r["id"] is not None}
        gone = [rack for rid, rack in live.items() if rid not in kept]
        _remove_slots([s for s in live_slots.values() if s.rack_id in {r.id for r in gone}], user)
        Rack.objects.filter(id__in=[r.id for r in gone]).update(deleted_at=timezone.now())
        # Codes may swap between racks: park the kept ones on unique temporary codes first (partial unique index).
        for rid in kept:
            Rack.objects.filter(id=rid).update(code=f"~{rid}")

        ids = {}
        for rack in racks:
            fields = {k: rack[k] for k in ("code", "x_cm", "y_cm", "rotation", "length_cm", "arm_cm")}
            if rack["id"] is None:
                obj = Rack.objects.create(layout=layout, **fields)
                if rack["key"]:
                    ids[rack["key"]] = obj.id
            else:
                obj = live[rack["id"]]
                for key, value in fields.items():
                    setattr(obj, key, value)
                obj.save()
            mine = {sid: s for sid, s in live_slots.items() if s.rack_id == obj.id}
            for slot in rack["slots"]:
                if slot["id"] is not None and slot["id"] not in mine:
                    raise Invalid("یکی از جایگاه‌ها دیگر وجود ندارد؛ صفحه را دوباره بارگیری کنید.")
            keep_slots = {s["id"] for s in rack["slots"] if s["id"] is not None}
            _remove_slots([s for sid, s in mine.items() if sid not in keep_slots], user)
            for slot in rack["slots"]:
                fields = {k: slot[k] for k in ("side", "kind", "offset_cm", "length_cm")}
                if slot["id"] is None:
                    new = RackSlot.objects.create(rack=obj, **fields)
                    if slot["key"]:
                        ids[slot["key"]] = new.id
                else:
                    RackSlot.objects.filter(id=slot["id"]).update(**fields, updated_at=timezone.now())
    return layout, ids


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
