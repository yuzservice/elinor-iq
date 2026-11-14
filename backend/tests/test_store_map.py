"""Store map: role matrix, versioned atomic saves (409 on conflict), slot history that survives rack deletion."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.products.models import Color, Product, ProductMetrics, Variant
from apps.store_map import layout as layout_module
from apps.store_map.models import Rack, RackSlot, SlotProduct, SlotProductHistory, StoreLayout

User = get_user_model()
URL = "/api/store-map/layout/"


def _client(role, name=""):
    user = User.objects.create_user(username=f"u_{role}{name}", password="secret-pass", role=role)
    client = APIClient()
    client.force_login(user)
    return client


def _doc(version=None, racks=None, **store):
    return {"version": version, "width_cm": 1800, "height_cm": 1400, "door_side": "left", "door_offset_cm": 600,
            "door_width_cm": 150, **store, "racks": racks if racks is not None else [_rack("R-01", "k1")]}


def _rack(code, key, rid=None, x=100, slots=None):
    return {"id": rid, "key": key, "code": code, "x_cm": x, "y_cm": 100, "rotation": 0, "length_cm": 150, "arm_cm": 50,
            "slots": slots if slots is not None else [
                {"id": None, "key": f"{key}a", "side": "a", "kind": "full", "offset_cm": 0, "length_cm": 150},
                {"id": None, "key": f"{key}b", "side": "b", "kind": "half", "offset_cm": 40, "length_cm": None},
            ]}


@pytest.fixture
def designer(db):
    return _client(User.ROLE_SUPER_ADMIN, "_designer")


@pytest.fixture
def saved(designer):
    """A layout with two racks (R-01, R-02), saved once (version 1)."""
    response = designer.put(URL, _doc(racks=[_rack("R-01", "k1"), _rack("R-02", "k2", x=400)]), format="json")
    assert response.status_code == 200, response.data
    return response.data


@pytest.fixture
def product(db):
    color = Color.objects.create(source_id=1, name="مشکی", code="111111")
    item = Product.objects.create(source_id=10, title="وست جین زنانه ۷۵۵۶ | الینور", status="available")
    Variant.objects.create(source_id=100, product=item, color=color)
    ProductMetrics.objects.create(product_id=item.id, as_of="2026-11-14", status="driver")
    return item


# ---------------------------------------------------------------- roles

# GET layout, PUT layout, PATCH slot, GET products
MATRIX = {
    User.ROLE_SUPER_ADMIN: (200, 200, 200, 200),
    User.ROLE_ADMIN: (200, 403, 200, 200),
    User.ROLE_MANAGER: (200, 403, 200, 200),
    User.ROLE_SALES_STAFF: (200, 403, 200, 200),
    User.ROLE_ANALYST: (200, 403, 403, 403),
    User.ROLE_STAFF: (200, 403, 403, 403),
    User.ROLE_STORE_STAFF: (200, 403, 403, 403),
    User.ROLE_SALES_AGENT: (403, 403, 403, 403),
    User.ROLE_CONTENT: (403, 403, 403, 403),
}


@pytest.mark.parametrize("role", list(MATRIX))
def test_role_matrix(role, saved, product):
    client = _client(role)
    slot_id = saved["ids"]["k1a"]
    read = client.get(URL).status_code
    assign = client.patch(f"/api/store-map/slots/{slot_id}/", {"product_id": product.id}, format="json").status_code
    search = client.get("/api/store-map/products/?q=7556").status_code
    design = client.put(URL, _doc(version=saved["version"]), format="json").status_code  # last: a save replaces the racks
    got = (read, design, assign, search)
    assert got == MATRIX[role]
    me = client.get("/api/auth/me/").data
    expected = {200: "view"}.get(MATRIX[role][0])
    if MATRIX[role][1] == 200:
        expected = "design"
    elif MATRIX[role][2] == 200:
        expected = "edit"
    assert me["store_map"] == expected


@pytest.mark.parametrize("path", ["/api/home/summary/", "/api/customers/", "/api/products/report/", "/api/system/status/",
                                  "/api/calls/tasks/", "/api/sales/targets/?year=1405", "/api/pulse/status/"])
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
    response = designer.put(URL, _doc(racks=[]), format="json")
    assert response.status_code == 200 and response.data["version"] == 1
    data = designer.get(URL).data["layout"]
    assert (data["width_cm"], data["height_cm"], data["racks"]) == (1800, 1400, [])


def test_reload_shows_exactly_the_saved_state(designer, saved):
    data = designer.get(URL).data["layout"]
    assert data["version"] == 1 and [r["code"] for r in data["racks"]] == ["R-01", "R-02"]
    first = data["racks"][0]
    assert first["id"] == saved["ids"]["k1"] and (first["x_cm"], first["length_cm"], first["arm_cm"]) == (100, 150, 50)
    assert [(s["side"], s["kind"], s["offset_cm"], s["length_cm"]) for s in first["slots"]] == [("a", "full", 0, 150), ("b", "half", 40, None)]


def test_version_conflict_is_409_and_changes_nothing(designer, saved):
    moved = _doc(version=1, racks=[_rack("R-01", "k1", rid=saved["ids"]["k1"], x=700)])
    assert designer.put(URL, moved, format="json").status_code == 200  # now version 2
    stale = designer.put(URL, _doc(version=1, racks=[]), format="json")
    assert stale.status_code == 409 and stale.data["code"] == "version_conflict" and stale.data["version"] == 2
    assert "دوباره بارگیری" in stale.data["detail"]
    data = designer.get(URL).data["layout"]
    assert data["version"] == 2 and [(r["code"], r["x_cm"]) for r in data["racks"]] == [("R-01", 700)]
    # A second designer creating from scratch over an existing layout is a conflict too.
    assert designer.put(URL, _doc(version=None), format="json").status_code == 409


def test_failed_save_leaves_the_old_state(designer, saved, monkeypatch):
    bad = _doc(version=1, racks=[_rack("R-09", "k9", x=900), _rack("R-01", "k1", rid=987654)])
    assert designer.put(URL, bad, format="json").status_code == 400  # unknown rack id, found after the first writes

    def explode(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(layout_module.RackSlot.objects, "create", explode)
    client = designer
    client.raise_request_exception = False
    assert client.put(URL, _doc(version=1, racks=[_rack("R-07", "k7", x=900)]), format="json").status_code == 500
    monkeypatch.undo()
    data = designer.get(URL).data["layout"]
    assert data["version"] == 1 and [r["code"] for r in data["racks"]] == ["R-01", "R-02"]
    assert Rack.objects.count() == 2 and RackSlot.objects.count() == 4


def test_codes_can_swap_between_racks(designer, saved):
    swap = _doc(version=1, racks=[_rack("R-02", "k1", rid=saved["ids"]["k1"]), _rack("R-01", "k2", rid=saved["ids"]["k2"], x=400)])
    assert designer.put(URL, swap, format="json").status_code == 200
    assert {r["id"]: r["code"] for r in designer.get(URL).data["layout"]["racks"]} == {saved["ids"]["k1"]: "R-02", saved["ids"]["k2"]: "R-01"}


@pytest.mark.parametrize(
    "racks",
    [
        [_rack("R-01", "a"), _rack("R-01", "b")],  # duplicate code
        [{**_rack("R-01", "a"), "rotation": 45}],
        [_rack("R-01", "a", slots=[{"side": "a", "kind": "full", "offset_cm": 100, "length_cm": 100}])],  # past the rack end
        [_rack("R-01", "a", slots=[{"side": "c", "kind": "full", "offset_cm": 0, "length_cm": 100}])],
        [{**_rack("R-01", "a"), "length_cm": "abc"}],
    ],
)
def test_invalid_documents_are_rejected(designer, racks):
    assert designer.put(URL, _doc(racks=racks), format="json").status_code == 400
    assert not StoreLayout.objects.exists()


def test_branch_must_be_a_visible_store(designer, settings):
    settings.HIDDEN_SALES_LINES = "CAPRI"
    assert designer.get(URL + "?branch=ONLINE").status_code == 400
    assert designer.get(URL + "?branch=CAPRI").status_code == 400
    assert designer.get(URL + "?branch=GORGAN").status_code == 200


# ---------------------------------------------------------------- products on slots


def test_assignment_writes_history_that_survives_rack_delete(designer, saved, product):
    other = Product.objects.create(source_id=11, title="مانتو کتان 7102", status="out_of_stock")
    slot = saved["ids"]["k1a"]
    patch = lambda pid: designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": pid}, format="json")  # noqa: E731
    first = patch(product.id)
    assert first.status_code == 200
    assert first.data["product"] == {"id": product.id, "title": "وست جین زنانه ۷۵۵۶", "short_code": "7556", "color": "#111111", "status": "driver"}
    assert patch(product.id).status_code == 200  # same product: no new history row
    assert patch(other.id).status_code == 200 and patch(None).status_code == 200
    assert list(SlotProductHistory.objects.order_by("id").values_list("reason", "old_product_id", "new_product_id")) == [
        ("assign", None, product.id), ("assign", product.id, other.id), ("clear", other.id, None)]
    patch(product.id)
    assert designer.get(URL).data["layout"]["racks"][0]["slots"][0]["product"]["short_code"] == "7556"

    # The designer deletes R-01: its slots and rack are soft-deleted, the product is cleared with a history row.
    keep = _doc(version=1, racks=[_rack("R-02", "k2", rid=saved["ids"]["k2"], x=400, slots=[])])
    assert designer.put(URL, keep, format="json").status_code == 200
    assert SlotProductHistory.objects.filter(slot_id=slot).count() == 5
    assert SlotProductHistory.objects.filter(slot_id=slot).first().reason == "slot_removed"
    assert not SlotProduct.objects.exists()
    assert Rack.objects.get(id=saved["ids"]["k1"]).deleted_at is not None
    assert RackSlot.objects.filter(rack_id=saved["ids"]["k1"], deleted_at__isnull=True).count() == 0
    assert patch(product.id).status_code == 404  # a removed slot cannot take a product
    assert [r["code"] for r in designer.get(URL).data["layout"]["racks"]] == ["R-02"]


def test_slot_rejects_unknown_or_draft_products(designer, saved):
    draft = Product.objects.create(source_id=12, title="پیش‌نویس 1111", status="draft")
    slot = saved["ids"]["k1a"]
    assert designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": draft.id}, format="json").status_code == 404
    assert designer.patch(f"/api/store-map/slots/{slot}/", {"product_id": "x"}, format="json").status_code == 400
    assert not SlotProductHistory.objects.exists()


def test_product_search_is_paginated_and_skips_drafts(designer):
    for n in range(25):
        Product.objects.create(source_id=1000 + n, title=f"شومیز حریر {5500 + n}", status="available")
    Product.objects.create(source_id=2000, title="شومیز پیش‌نویس 5501", status="draft")
    page = designer.get("/api/store-map/products/?q=شومیز").data
    assert (page["count"], page["pages"], len(page["results"])) == (25, 2, 20)
    assert designer.get("/api/store-map/products/?q=شومیز&page=2").data["results"].__len__() == 5
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
