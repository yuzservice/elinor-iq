"""Product short code for the store map: the number at the end of the product title (before the «| الینور» suffix),
Persian or Latin digits, e.g. «وست جین زنانه ۷۵۵۶ | الینور» → "7556"; the product id when the title has none.
Local `products` table only: never calls the Elinor API."""

import re

from django.db.models import Q

_TO_LATIN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_TO_PERSIAN = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_TRAILING = re.compile(r"(\d+)\s*$")
HIDDEN_STATUSES = ("draft",)  # «active» = every synced product except drafts


def latin_digits(text):
    return (text or "").translate(_TO_LATIN)


def display_title(title):
    """The title as the Products page shows it: the part before «|»."""
    return (title or "").split("|", 1)[0].strip()


def short_code(product_id, title):
    match = _TRAILING.search(latin_digits(display_title(title)))
    return match.group(1) if match else str(product_id)


def search_filter(query):
    """Title or number, typed with Persian or Latin digits; a bare number also matches the product id."""
    query = (query or "").strip()
    if not query:
        return Q()
    latin = latin_digits(query)
    found = Q(title__icontains=query) | Q(title__icontains=latin) | Q(title__icontains=latin.translate(_TO_PERSIAN))
    if latin.isdigit():
        found |= Q(id=int(latin))
    return found
