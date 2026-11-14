"""Store map: role matrix, versioned atomic saves (409 on conflict), slot history that survives rack deletion.
Racks are instances of templates (see test_store_map_templates.py for the template rules)."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.products.models import Color, Product, ProductMetrics, Variant
from apps.store_map import templates as templates_module
from apps.store_map.models import Rack, RackSlot, SlotProduct, SlotProductHistory, StoreLayout

User = get_user_model()
URL = "/api/store-map/layout/"
TEMPLATES = "/api/store-map/templates/"


def _client(role, name=""):
    user = User.objects.create_user(username=f"u_{role}{name}", password="secret-pass", role=role)
    client = APIClient()
    client.force_login(user)
    return client


def _doc(version=None, racks=None, **store):
    return {"version": version, "width_cm": 1800, "height_cm": 1400, "door_side": "left", "door_offset_cm": 600,
            "door_width_cm": 150, **store, "racks": racks if racks is not None else []}


def _rack(code, key, template_id, rid=None, x=100, rotation=0):
    return {"id": rid, "key": key, "code": code, "x_cm": x, "y_cm": 100, "rotation": rotation, "template_id": template_id}


LINE = {"kind": "line", "name": "خطی", "length_cm": 150, "arm_cm": 50, "pieces": [
    {"id": None, "key": "pa", "side": "a", "kind": "full", "offset_cm": 0, "length_cm": 150},
    {"id": None, "key": "pb", "side": "b", "kind": "half", "offset_cm": 40, "length_cm": None},
]}
CROSS = {"kind": "hub", "name": "صلیبی", "arms": [{"id": None, "key": f"a{d}", "angle_deg": d, "length_cm": 45, "steps": 2} for d in (0, 90, 180, 270)]}


def make_template(client, version, body):
    response = client.post(TEMPLATES, {**body, "version": version}, format="json")
    assert response.status_code == 201, response.data
    return response.data


def slot_of(rack_payload, piece_id=None, arm_id=None, step=None):
    return next(s["id"] for s in rack_payload["slots"] if (piece_id and s["piece_id"] == piece_id) or (arm_id and s["arm_id"] == arm_id and s["step"] == step))


@pytest.fixture
def designer(db):
    return _client(User.ROLE_SUPER_ADMIN, "_designer")


@pytest.fixture
def saved(designer):
    """A layout with a line template (full piece on side a, half piece on side b) and two racks R-01, R-02 built from it."""
    assert designer.put(URL, _doc(), format="json").status_code == 200
    t = make_template(designer, 1, LINE)
    tid = t["template"]["id"]
    pieces = {p["side"]: p["id"] for p in t["template"]["pieces"]}
    response = designer.put(URL, _doc(version=t["version"], racks=[_rack("R-01", "k1", tid), _rack("R-02", "k2", tid, x=400)]), format="json")
    assert response.status_code == 200, response.data
    racks = response.data["created"]
    return {"version": response.data["version"], "template": tid, "pieces": pieces, "racks": racks,
            "slot": slot_of(racks["k1"], piece_id=pieces["a"])}


@pytest.fixture
def product(db):
    color = Color.objects.create(source_id=1, name="مشکی", code="111111")
    item = Product.objects.create(source_id=10, title="وست جین زنانه ۷۵۵۶ | الینور", status="available")
    Variant.objects.create(source_id=100, product=item, color=color)
    ProductMetrics.objects.create(product_id=item.id, as_of="2026-11-14", status="driver")
    return item


# ---------------------------------------------------------------- roles

# GET layout, PUT layout, PATCH slot, GET products, POST/PUT/DELETE template
MATRIX = {
    User.ROLE_SUPER_ADMIN: (200, 200, 200, 200, 201, 200, 200),
    User.ROLE_ADMIN: (200, 403, 200, 200, 403, 403, 403),
    User.ROLE_MANAGER: (200, 403, 200, 200, 403, 403, 403),
    User.ROLE_SALES_STAFF: (200, 403, 200, 200, 403, 403, 403),
    User.ROLE_ANALYST: (200, 403, 403, 403, 403, 403, 403),
    User.ROLE_STAFF: (200, 403, 403, 403, 403, 403, 403),
    User.ROLE_STORE_STAFF: (200, 403, 403, 403, 403, 403, 403),
    User.ROLE_SALES_AGENT: (403, 403, 403, 403, 403, 403, 403),
    User.ROLE_CONTENT: (403, 403, 403, 403, 403, 403, 403),
}


@pytest.mark.parametrize("role", list(MATRIX))
def test_role_matrix(role, saved, product):
    client = _client(role)
    read = client.get(URL).status_code
    assign = client.patch(f"/api/store-map/slots/{saved['slot']}/", {"product_id": product.id}, format="json").status_code
    search = client.get("/api/store-map/products/?q=7556").status_code
    version = StoreLayout.objects.get().version
    created = client.post(TEMPLATES, {**CROSS, "version": version}, format="json")
    version = StoreLayout.objects.get().version
    edited = client.put(f"{TEMPLATES}{saved['template']}/", {**LINE, "name": "خطی ۲", "version": version,
                        "pieces": [{**p, "id": saved["pieces"][p["side"]]} for p in LINE["pieces"]]}, format="json").status_code
    version = StoreLayout.objects.get().version
    spare = created.data["template"]["id"] if created.status_code == 201 else saved["template"]
    deleted = client.delete(f"{TEMPLATES}{spare}/?version={version}").status_code
    version = StoreLayout.objects.get().version
    design = client.put(URL, _doc(version=version), format="json").status_code  # last: a save replaces the racks
    assert (read, design, assign, search, created.status_code, edited, deleted) == MATRIX[role]
    expected = "design" if MATRIX[role][1] == 200 else "edit" if MATRIX[role][2] == 200 else "view" if read == 200 else None
    assert client.get("/api/auth/me/").data["store_map"] == expected


@pytest.mark.parametrize("path", ["/api/home/summary/", "/api/customers/", "/api/products/report/", "/api/system/status/",
                                  "/api/calls/tasks/", "/api/sales/targets/?year=1405", "/api/pulse/status/", TEMPLATES])
def test_store_staff_is_blocked_from_every_other_menu(db, path):
    response = _client(User.ROLE_STORE_STAFF).get(path)
    assert response.status_code == 403 and response.json()["detail"] == "به این بخش دسترسی ندارید."


def test_sales_staff_has_no_settings_api(db):
    client = _client(User.ROLE_SALES_STAFF)
    assert client.get("/api/system/status/").status_code == 403
    assert client.get("/api/system/admins/").status_code == 403
    assert client.get("/api/auth/me/").data["can_manage_calls"] is False


def test_new_roles_are_selectable_in_user_management(designer):
    for role in (User.ROLE_SALES_STAFF, User.ROLE_STORE_STAFF):
        response = designer.post("/api/system/admins/", {"username": f"new_{role}", "password": "secret-pass", "role": role}, format="json")
        assert response.status_code == 201 and response.data["role"] == role


# ---------------------------------------------------------------- saving


def test_empty_state_then_first_save(designer):
    assert designer.get(URL).data["layout"] is None
    response = designer.put(URL, _doc(), format="json")
    assert response.status_code == 200 and response.data["version"] == 1
    data = designer.get(URL).data["layout"]
    assert (data["width_cm"], data["height_cm"], data["racks"], data["templates"]) == (1800, 1400, [], [])
    assert designer.post(TEMPLATES, {**LINE, "version": 0}, format="json").status_code == 409


def test_reload_shows_exactly_the_saved_state(designer, saved):
    data = designer.get(URL).data["layout"]
    assert data["version"] == saved["version"] and [r["code"] for r in data["racks"]] == ["R-01", "R-02"]
    first = data["racks"][0]
    assert (first["id"], first["x_cm"], first["template_id"], first["footprint_cm"]) == (saved["racks"]["k1"]["id"], 100, saved["template"], [150, 100])
    assert sorted((s["piece_id"], s["product"]) for s in first["slots"]) == sorted((pid, None) for pid in saved["pieces"].values())
    template = data["templates"][0]
    assert (template["kind"], template["racks"], len(template["pieces"])) == ("line", 2, 2)


def test_version_conflict_is_409_and_changes_nothing(designer, saved):
    v, tid, k1 = saved["version"], saved["template"], saved["racks"]["k1"]["id"]
    assert designer.put(URL, _doc(version=v, racks=[_rack("R-01", "k1", tid, rid=k1, x=700)]), format="json").status_code == 200
    stale = designer.put(URL, _doc(version=v, racks=[]), format="json")
    assert stale.status_code == 409 and stale.data["code"] == "version_conflict" and stale.data["version"] == v + 1
    assert "دوباره بارگیری" in stale.data["detail"]
    data = designer.get(URL).data["layout"]
    assert data["version"] == v + 1 and [(r["code"], r["x_cm"]) for r in data["racks"]] == [("R-01", 700)]
    # Template saves share the version: a stale one is a conflict too.
    assert designer.post(TEMPLATES, {**CROSS, "version": v}, format="json").status_code == 409
    assert designer.put(URL, _doc(version=None), format="json").status_code == 409


def test_failed_save_leaves_the_old_state(designer, saved, monkeypatch):
    v, tid = saved["version"], saved["template"]
    bad = _doc(version=v, racks=[_rack("R-09", "k9", tid, x=900), _rack("R-01", "k1", tid, rid=987654)])
    assert designer.put(URL, bad, format="json").status_code == 400  # unknown rack id, found after the first writes

    def explode(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(templates_module.RackSlot.objects, "bulk_create", explode)
    designer.raise_request_exception = False
    assert designer.put(URL, _doc(version=v, racks=[_rack("R-07", "k7", tid, x=900)]), format="json").status_code == 500
    monkeypatch.undo()
    data = designer.get(URL).data["layout"]
    assert data["version"] == v and [r["code"] for r in data["racks"]] == ["R-01", "R-02"]
    assert Rack.objects.count() == 2 and RackSlot.objects.count() == 4


def test_codes_can_swap_between_racks(designer, saved):
    tid, k1, k2 = saved["template"], saved["racks"]["k1"]["id"], saved["racks"]["k2"]["id"]
    swap = _doc(version=saved["version"], racks=[_rack("R-02", "k1", tid, rid=k1), _rack("R-01", "k2", tid, rid=k2, x=400)])
    assert designer.put(URL, swap, format="json").status_code == 200
    assert {r["id"]: r["code"] for r in designer.get(URL).data["layout"]["racks"]} == {k1: "R-02", k2: "R-01"}


def test_rack_rules(designer, saved):
    v, tid, k1 = saved["version"], saved["template"], saved["racks"]["k1"]["id"]
    put = lambda racks: designer.put(URL, _doc(version=v, racks=racks), format="json")  # noqa: E731
    assert put([_rack("R-01", "a", tid), _rack("R-01", "b", tid)]).status_code == 400  # duplicate code
    assert put([_rack("R-01", "a", tid, rotation=180)]).status_code == 400  # 180/270: hub templates only
    assert put([_rack("R-01", "a", None)]).status_code == 400  # a rack needs a template
    assert put([_rack("R-01", "a", 987654)]).status_code == 400
    other = make_template(designer, v, CROSS)
    v = other["version"]
    moved = designer.put(URL, _doc(version=v, racks=[_rack("R-01", "k1", other["template"]["id"], rid=k1)]), format="json")
    assert moved.status_code == 400  # a rack keeps its template
    hub = designer.put(URL, _doc(version=v, racks=[_rack("H-1", "h", other["template"]["id"], rotation=270)]), format="json")
    assert hub.status_code == 200 and len(hub.data["created"]["h"]["slots"]) == 8


def test_branch_must_be_a_visible_store(designer, settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert designer.get(URL + "?branch=ONLINE").status_code == 400
    assert designer.get(URL + "?branch=CAPRI").status_code == 400
    assert designer.get(URL + "?branch=GORGAN").status_code == 200


# ---------------------------------------------------------------- products on slots


def test_assignment_writes_history_that_survives_rack_delete(designer, saved, product):
    other = Product.objects.create(source_id=11, title="مانتو کتان 7102", status="out_of_stock")
    slot = saved["slot"]
    patch = lambda pid: designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": pid}, format="json")  # noqa: E731
    first = patch(product.id)
    assert first.status_code == 200
    assert first.data["product"] == {"id": product.id, "title": "وست جین زنانه ۷۵۵۶", "short_code": "7556", "color": "#111111", "status": "driver"}
    assert first.data["piece_id"] == saved["pieces"]["a"]
    assert patch(product.id).status_code == 200  # same product: no new history row
    assert patch(other.id).status_code == 200 and patch(None).status_code == 200
    assert list(SlotProductHistory.objects.order_by("id").values_list("reason", "old_product_id", "new_product_id")) == [
        ("assign", None, product.id), ("assign", product.id, other.id), ("clear", other.id, None)]
    patch(product.id)

    # The designer deletes R-01: its slots and rack are soft-deleted, the product is cleared with a history row.
    keep = _doc(version=saved["version"], racks=[_rack("R-02", "k2", saved["template"], rid=saved["racks"]["k2"]["id"], x=400)])
    assert designer.put(URL, keep, format="json").status_code == 200
    assert SlotProductHistory.objects.filter(slot_id=slot).count() == 5
    assert SlotProductHistory.objects.filter(slot_id=slot).first().reason == "slot_removed"
    assert not SlotProduct.objects.exists()
    assert Rack.objects.get(id=saved["racks"]["k1"]["id"]).deleted_at is not None
    assert RackSlot.objects.filter(rack_id=saved["racks"]["k1"]["id"], deleted_at__isnull=True).count() == 0
    assert patch(product.id).status_code == 404  # a removed slot cannot take a product
    assert [r["code"] for r in designer.get(URL).data["layout"]["racks"]] == ["R-02"]


def test_slot_rejects_unknown_or_draft_products(designer, saved):
    draft = Product.objects.create(source_id=12, title="پیش‌نویس 1111", status="draft")
    slot = saved["slot"]
    assert designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": draft.id}, format="json").status_code == 404
    assert designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": "x"}, format="json").status_code == 400
    assert not SlotProductHistory.objects.exists()


def test_product_search_is_paginated_and_skips_drafts(designer):
    for n in range(25):
        Product.objects.create(source_id=1000 + n, title=f"شومیز حریر {5500 + n}", status="available")
    Product.objects.create(source_id=2000, title="شومیز پیش‌نویس 5501", status="draft")
    page = designer.get("/api/store-map/products/?q=شومیز").data
    assert (page["count"], page["pages"], len(page["results"])) == (25, 2, 20)
    assert len(designer.get("/api/store-map/products/?q=شومیز&page=2").data["results"]) == 5
    found = designer.get("/api/store-map/products/?q=۵۵۰۱").data["results"]
    assert [r["short_code"] for r in found] == ["5501"]


def test_product_colour_falls_back_to_the_colour_name(db):
    from apps.store_map.layout import product_cards

    Color.objects.create(source_id=2, name="کرم", code="#e1dbdb")
    named = Product.objects.create(source_id=20, title="مانتو 1200", status="available")
    Variant.objects.create(source_id=200, product=named, color_name="کرم")
    bare = Product.objects.create(source_id=21, title="شال", status="available")
    cards = product_cards([named.id, bare.id])
    assert cards[named.id]["color"] == "#e1dbdb" and cards[bare.id]["color"] is None
    assert cards[bare.id]["short_code"] == str(bare.id) and cards[bare.id]["status"] is None
