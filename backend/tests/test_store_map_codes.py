"""Store map product short code: trailing title number, Persian or Latin digits, product id fallback; digit-agnostic search."""

import pytest

from apps.products.models import Product
from apps.store_map.codes import display_title, search_filter, short_code


@pytest.mark.parametrize(
    ("title", "code"),
    [
        ("وست جین زنانه 7556", "7556"),
        ("وست جین زنانه ۷۵۵۶", "7556"),
        ("اورکت هشت دکمه لینن زنانه  4086 | الینور", "4086"),
        ("اسلیپر دو سگک زنانه 1276| الینور", "1276"),
        ("شلوار ۲ تکه ٥٥٣٠", "5530"),
        ("شال ساده", "42"),
        ("", "42"),
        (None, "42"),
        ("کیف 12 مدل نو", "42"),
    ],
)
def test_short_code(title, code):
    assert short_code(42, title) == code


def test_display_title_drops_the_brand_suffix():
    assert display_title("وست جین 7556 | الینور") == "وست جین 7556"


@pytest.mark.django_db
def test_search_matches_title_or_number_with_either_digits():
    latin = Product.objects.create(source_id=1, title="وست جین زنانه 7556 | الینور")
    persian = Product.objects.create(source_id=2, title="مانتو کتان ۷۱۰۲")
    Product.objects.create(source_id=3, title="شال ساده")
    ids = lambda q: set(Product.objects.filter(search_filter(q)).values_list("id", flat=True))  # noqa: E731
    assert ids("۷۵۵۶") == {latin.id} and ids("7556") == {latin.id}
    assert ids("7102") == {persian.id} and ids("۷۱۰۲") == {persian.id}
    assert ids("وست") == {latin.id}
    assert ids(str(persian.id)) >= {persian.id}
