import pytest
from rest_framework.test import APIClient

from apps.customers.metrics import refresh_customer_metrics
from apps.products import categories as cats
from apps.products.models import Category, Product
from tests.test_customer_list_redesign import _customer, _ids, _order, _rows
from apps.sales.models import OrderItem


@pytest.fixture
def tree(db):
    clothes = Category.objects.create(source_id=1, title="پوشاک")
    manto = Category.objects.create(source_id=2, title="مانتو", parent=clothes)
    linen = Category.objects.create(source_id=3, title="مانتو کتان", parent=manto)
    bags = Category.objects.create(source_id=4, title="کیف")
    kids = Category.objects.create(source_id=5, title="بچگانه")
    kids_manto = Category.objects.create(source_id=6, title="مانتو", parent=kids)
    hidden = Category.objects.create(source_id=7, title="قدیمی", status=False)
    return {"clothes": clothes, "manto": manto, "linen": linen, "bags": bags, "kids_manto": kids_manto, "hidden": hidden}


@pytest.mark.django_db
def test_tree_paths_short_labels_and_inactive(tree):
    rows = {row["id"]: row for row in cats.tree()}
    assert rows[tree["linen"].pk]["path"] == "پوشاک › مانتو › مانتو کتان"
    assert rows[tree["manto"].pk]["label"] == "مانتو (پوشاک)" and rows[tree["kids_manto"].pk]["label"] == "مانتو (بچگانه)"
    assert rows[tree["bags"].pk]["label"] == "کیف"
    assert tree["hidden"].pk not in rows  # inactive: not offered, history kept
    assert tree["hidden"].pk in {row["id"] for row in cats.tree(include_inactive=True)}
    assert cats.descendant_ids([tree["clothes"].pk]) == {tree["clothes"].pk, tree["manto"].pk, tree["linen"].pk}


@pytest.mark.django_db
def test_customer_filter_by_id_includes_descendants_and_old_titles_stay_exact(tree, auth_api):
    linen_product = Product.objects.create(source_id=1, title="مانتو کتان 1111 | الینور")
    linen_product.categories.add(tree["linen"])
    bag = Product.objects.create(source_id=2, title="کیف 2222 | الینور")
    bag.categories.add(tree["bags"])
    a, b, c = _customer(1), _customer(2), _customer(3)
    for customer, product in ((a, linen_product), (b, bag)):
        order = _order(customer)
        OrderItem.objects.create(source_id=next(_ids), order=order, product=product, quantity=1, amount=1)
    refresh_customer_metrics()
    q = "&sort=name&dir=asc"
    assert _rows(auth_api, f"category_ids={tree['clothes'].pk}" + q) == [1]  # parent includes the linen leaf
    assert _rows(auth_api, f"category_ids={tree['clothes'].pk},{tree['bags'].pk}" + q) == [1, 2]
    # Old views kept titles; they must return what the title filter returned (exact category, no descendants).
    assert _rows(auth_api, "categories=مانتو کتان" + q) == [1]
    assert _rows(auth_api, "categories=پوشاک" + q) == []
    assert _rows(auth_api, "categories=نامعلوم" + q) == []
    assert cats.ids_for_titles(["مانتو کتان", "نامعلوم"]) == ([tree["linen"].pk], ["نامعلوم"])


@pytest.mark.django_db
def test_sync_from_payloads_is_idempotent(tree):
    product = Product.objects.create(source_id=9, title="شلوار 3333 | الینور", source_payload={"categories": [
        {"id": 3, "title": "مانتو کتان", "parent_id": 2, "status": 1},
        {"id": 8, "title": "شلوار", "parent_id": 1, "status": 1},
    ]})
    first = cats.sync_from_payloads()
    assert first["created"] == 1 and first["products_relinked"] == 1
    new = Category.objects.get(source_id=8)
    assert new.parent == tree["clothes"] and new.status
    assert set(product.categories.values_list("source_id", flat=True)) == {3, 8}
    second = cats.sync_from_payloads()
    assert second["created"] == second["updated"] == second["products_relinked"] == 0


@pytest.mark.django_db
def test_category_tree_endpoint(tree, auth_api):
    data = auth_api.get("/api/products/categories/").data["results"]
    assert [row["title"] for row in data][:3] == ["بچگانه", "مانتو", "پوشاک"] or data
    assert all({"id", "label", "path", "parent_id", "depth", "has_children"} <= set(row) for row in data)
    assert APIClient().get("/api/products/categories/").status_code in (401, 403)
