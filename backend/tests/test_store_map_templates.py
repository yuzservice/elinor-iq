"""Rack templates: the 0002 data migration, slot sync on every rack, blocked removals (409, nothing changed), delete
refused while in use, hub footprint with rotation, validation."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.products.models import Product
from apps.store_map.models import RackSlot, RackTemplate, SlotProduct, SlotProductHistory, StoreLayout, TemplateArm
from apps.store_map.templates import footprint
from tests.test_store_map import CROSS, LINE, TEMPLATES, URL, _doc, _rack, designer, make_template, saved, slot_of  # noqa: F401

# ---------------------------------------------------------------- footprint


@pytest.mark.parametrize(
    ("arms", "rotation", "expected"),
    [
        ([(0, 45), (90, 45), (180, 45), (270, 45)], 0, (100, 100)),  # cross: 90 cm across → 2 cells each way
        ([(0, 45), (90, 45), (180, 45), (270, 45)], 90, (100, 100)),
        ([(270, 60)], 0, (50, 100)),  # wall arm pointing down: post 12 wide, 66 deep
        ([(270, 60)], 90, (100, 50)),  # turned a quarter: now pointing right
        ([(0, 50), (180, 50)], 0, (100, 50)),
        ([(0, 50), (180, 50)], 90, (50, 100)),
        ([(45, 90)], 0, (100, 100)),  # diagonal: cos 45° × 90 + 6 ≈ 69.6 → 2 cells
        ([(0, 44)], 180, (50, 50)),  # 44 + 6 = 50 exactly → one cell, not two
    ],
)
def test_hub_footprint(arms, rotation, expected):
    assert footprint("hub", rotation, arms=arms) == expected


def test_line_footprint():
    assert footprint("line", 0, length_cm=150, arm_cm=50, sides=2) == (150, 100)
    assert footprint("line", 90, length_cm=160, arm_cm=50, sides=1) == (50, 200)


# ---------------------------------------------------------------- sync


@pytest.fixture
def cross(designer, saved):
    """The `saved` layout plus a cross template and two racks X-1, X-2 built from it."""
    t = make_template(designer, saved["version"], CROSS)
    tid = t["template"]["id"]
    racks = [_rack(f"R-0{i}", f"k{i}", saved["template"], rid=saved["racks"][f"k{i}"]["id"], x=100 + 300 * (i - 1)) for i in (1, 2)]
    response = designer.put(URL, _doc(version=t["version"], racks=racks + [_rack("X-1", "x1", tid, x=900), _rack("X-2", "x2", tid, x=1100, rotation=90)]), format="json")
    assert response.status_code == 200, response.data
    return {"version": response.data["version"], "id": tid, "arms": t["template"]["arms"], "racks": response.data["created"]}


def _arms(cross, changes):
    return [{**a, **changes.get(a["angle_deg"], {})} for a in cross["arms"]]


def _put_template(designer, cross, arms, name="صلیبی"):
    return designer.put(f"{TEMPLATES}{cross['id']}/", {"version": StoreLayout.objects.get().version, "name": name, "arms": arms}, format="json")


def test_adding_and_removing_steps_syncs_every_rack(designer, cross):
    more = _put_template(designer, cross, _arms(cross, {0: {"steps": 4}}))
    assert more.status_code == 200
    assert sorted(len(r["slots"]) for r in more.data["racks"]) == [10, 10]
    less = _put_template(designer, cross, _arms(cross, {0: {"steps": 1}, 90: {"steps": 1}}))
    assert less.status_code == 200 and sorted(len(r["slots"]) for r in less.data["racks"]) == [6, 6]
    east = next(a["id"] for a in cross["arms"] if a["angle_deg"] == 0)
    live = RackSlot.objects.filter(template_arm_id=east, deleted_at__isnull=True)
    assert sorted(live.values_list("step_index", flat=True)) == [0, 0]
    assert RackSlot.objects.filter(template_arm_id=east, deleted_at__isnull=False).count() == 6  # soft-deleted, kept


def test_adding_and_removing_an_arm(designer, cross):
    added = _put_template(designer, cross, cross["arms"] + [{"id": None, "key": "nw", "angle_deg": 135, "length_cm": 60, "steps": 3}])
    assert added.status_code == 200 and "nw" in added.data["ids"]
    assert sorted(len(r["slots"]) for r in added.data["racks"]) == [11, 11]
    removed = _put_template(designer, cross, [a for a in cross["arms"] if a["angle_deg"] != 270] + [{**added.data["template"]["arms"][-1]}])
    assert removed.status_code == 200 and sorted(len(r["slots"]) for r in removed.data["racks"]) == [9, 9]
    assert TemplateArm.objects.filter(template_id=cross["id"], deleted_at__isnull=False).count() == 1


def test_arms_may_swap_angles(designer, cross):
    swapped = _arms(cross, {0: {"angle_deg": 180}, 180: {"angle_deg": 0}})
    assert _put_template(designer, cross, swapped).status_code == 200
    assert sorted(TemplateArm.objects.filter(template_id=cross["id"], deleted_at__isnull=True).values_list("angle_deg", flat=True)) == [0, 90, 180, 270]


def test_line_pieces_sync(designer, saved):
    pieces = [{"id": saved["pieces"]["a"], "key": "pa", "side": "a", "kind": "full", "offset_cm": 0, "length_cm": 150}]
    body = {"version": saved["version"], "name": "خطی", "length_cm": 150, "arm_cm": 50,
            "pieces": pieces + [{"id": None, "key": "new", "side": "b", "kind": "full", "offset_cm": 0, "length_cm": 100}]}
    response = designer.put(f"{TEMPLATES}{saved['template']}/", body, format="json")
    assert response.status_code == 200, response.data
    new_piece = response.data["ids"]["new"]
    for rack in response.data["racks"]:  # the half piece's slot is gone, the new piece has one
        assert sorted(s["piece_id"] for s in rack["slots"]) == sorted([saved["pieces"]["a"], new_piece])


@pytest.mark.parametrize("change", ["step", "arm"])
def test_removing_a_step_or_arm_with_a_product_is_blocked(designer, cross, change):
    product = Product.objects.create(source_id=50, title="کراپ 9204", status="available")
    east = next(a for a in cross["arms"] if a["angle_deg"] == 0)
    slot = slot_of(cross["racks"]["x2"], arm_id=east["id"], step=1)
    assert designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": product.id}, format="json").status_code == 200
    before = (StoreLayout.objects.get().version, RackSlot.objects.filter(deleted_at__isnull=True).count(), TemplateArm.objects.get(id=east["id"]).steps)
    arms = _arms(cross, {0: {"steps": 1}}) if change == "step" else [a for a in cross["arms"] if a["id"] != east["id"]]
    response = _put_template(designer, cross, arms)
    assert response.status_code == 409 and response.data["code"] == "blocked"
    expected = "پله ۲ این بازو روی رگال‌های نقشه کالا دارد (رگال X-2). اول کالا را بردارید." if change == "step" else "این بازو روی رگال‌های نقشه کالا دارد (رگال X-2). اول کالاهایش را بردارید."
    assert response.data["detail"] == expected
    after = (StoreLayout.objects.get().version, RackSlot.objects.filter(deleted_at__isnull=True).count(), TemplateArm.objects.get(id=east["id"]).steps)
    assert after == before and TemplateArm.objects.get(id=east["id"]).deleted_at is None
    assert SlotProduct.objects.get().slot_id == slot and SlotProductHistory.objects.count() == 1


def test_removing_a_piece_with_a_product_is_blocked(designer, saved):
    product = Product.objects.create(source_id=51, title="شومیز 5530", status="available")
    assert designer.patch(f"/api/store-map/slots/{saved['slot']}/", {"product_id": product.id}, format="json").status_code == 200
    body = {"version": saved["version"], "name": "خطی", "length_cm": 150, "arm_cm": 50,
            "pieces": [{"id": saved["pieces"]["b"], "key": "pb", "side": "b", "kind": "half", "offset_cm": 40, "length_cm": None}]}
    response = designer.put(f"{TEMPLATES}{saved['template']}/", body, format="json")
    assert response.status_code == 409 and response.data["detail"] == "این تکه روی رگال‌های نقشه کالا دارد (رگال R-01). اول کالا را بردارید."
    assert StoreLayout.objects.get().version == saved["version"] and SlotProduct.objects.count() == 1


def test_delete_template_refused_while_in_use(designer, saved):
    used = designer.delete(f"{TEMPLATES}{saved['template']}/?version={saved['version']}")
    assert used.status_code == 409 and used.data["code"] == "blocked" and "۲ رگال" in used.data["detail"]
    spare = make_template(designer, saved["version"], CROSS)
    gone = designer.delete(f"{TEMPLATES}{spare['template']['id']}/?version={spare['version']}")
    assert gone.status_code == 200 and gone.data["version"] == spare["version"] + 1
    assert RackTemplate.objects.get(id=spare["template"]["id"]).deleted_at is not None
    assert [t["id"] for t in designer.get(URL).data["layout"]["templates"]] == [saved["template"]]


@pytest.mark.parametrize(
    "body",
    [
        {**CROSS, "arms": []},  # at least one arm
        {**CROSS, "arms": CROSS["arms"][:1] * 2},  # two arms in one direction
        {**CROSS, "arms": [{**CROSS["arms"][0], "angle_deg": 30}]},  # 45° steps only
        {**CROSS, "arms": [{**CROSS["arms"][0], "length_cm": 95}]},  # 20–90 cm
        {**CROSS, "arms": [{**CROSS["arms"][0], "steps": 6}]},  # 1–5 steps
        {**LINE, "pieces": []},  # at least one piece
        {**LINE, "name": ""},
        {**CROSS, "kind": "ring"},
    ],
)
def test_invalid_templates_are_rejected(designer, saved, body):
    assert designer.post(TEMPLATES, {**body, "version": saved["version"]}, format="json").status_code == 400
    assert RackTemplate.objects.count() == 1 and StoreLayout.objects.get().version == saved["version"]


# ---------------------------------------------------------------- data migration


@pytest.mark.django_db(transaction=True)
def test_data_migration_groups_racks_and_keeps_products_and_history():
    executor = MigrationExecutor(connection)
    before, after = [("store_map", "0001_initial")], [("store_map", "0002_rack_templates")]
    executor.migrate(before)
    old = executor.loader.project_state(before).apps
    Layout, Rack, Slot = (old.get_model("store_map", m) for m in ("StoreLayout", "Rack", "RackSlot"))
    SlotProductOld, HistoryOld = old.get_model("store_map", "SlotProduct"), old.get_model("store_map", "SlotProductHistory")
    product = old.get_model("products", "Product").objects.create(source_id=77, title="وست 7556")
    layout = Layout.objects.create(branch="SARI", width_cm=1800, height_cm=1400)

    def rack(code, length, pieces, deleted=False):
        r = Rack.objects.create(layout=layout, code=code, x_cm=0, y_cm=0, length_cm=length, arm_cm=50, deleted_at="2026-11-01T00:00Z" if deleted else None)
        return r, [Slot.objects.create(rack=r, side=side, kind=kind, offset_cm=offset, length_cm=plen) for side, kind, offset, plen in pieces]

    two = [("a", "full", 0, 150), ("b", "full", 0, 150)]
    r1, s1 = rack("R-01", 150, two)
    r2, _ = rack("R-02", 150, list(reversed(two)))  # same geometry, slots made in another order
    r3, s3 = rack("R-03", 190, [("a", "half", 90, None), ("a", "full", 0, 80), ("b", "full", 0, 190)])
    rack("R-04", 150, two, deleted=True)
    SlotProductOld.objects.create(slot=s1[0], product_id=product.id)
    SlotProductOld.objects.create(slot=s3[0], product_id=product.id)
    HistoryOld.objects.create(slot=s1[0], new_product_id=product.id, reason="assign")
    HistoryOld.objects.create(slot=s3[0], new_product_id=product.id, reason="assign")
    try:
        executor.loader.build_graph()
        executor.migrate(after)
        new = executor.loader.project_state(after).apps
        Template, RackNew, SlotNew = (new.get_model("store_map", m) for m in ("RackTemplate", "Rack", "RackSlot"))
        templates = {t.name: t for t in Template.objects.all()}
        assert set(templates) == {"رگال وسط دوطرفه ۱٫۵ متری", "رگال کامل و نیم ۱٫۹ متری"}
        two_sided = templates["رگال وسط دوطرفه ۱٫۵ متری"]
        assert two_sided.pieces.count() == 2 and templates["رگال کامل و نیم ۱٫۹ متری"].pieces.count() == 3
        assert {r.code: r.template_id for r in RackNew.objects.filter(deleted_at__isnull=True)} == {
            "R-01": two_sided.id, "R-02": two_sided.id, "R-03": templates["رگال کامل و نیم ۱٫۹ متری"].id}
        assert RackNew.objects.get(code="R-04").template_id is None
        live = SlotNew.objects.filter(rack__deleted_at__isnull=True)
        assert live.count() == 7 and not live.filter(template_piece__isnull=True).exists()
        # Each slot keeps its own geometry match: R-01 side a ↔ the side-a piece.
        assert SlotNew.objects.get(id=s1[0].id).template_piece.side == "a"
        assert SlotNew.objects.get(id=s3[0].id).template_piece.kind == "half"
        assert new.get_model("store_map", "SlotProduct").objects.count() == 2
        assert new.get_model("store_map", "SlotProductHistory").objects.count() == 2
    finally:
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
