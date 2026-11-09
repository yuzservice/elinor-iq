"""Product code = the trailing 4-digit number of `products.title` («... 8504 | الینور»).

Never source_id, barcode or sku: those are different numbers.
"""

import re

from django.db import transaction
from django.utils import timezone

from apps.products.models import Product

from .models import IgProductCode

TITLE_CODE = re.compile(r"(?<![0-9])([0-9]{4})\s*(?:\||$)")


def title_code(title):
    matches = TITLE_CODE.findall(title or "")
    return matches[-1] if matches else None


def rebuild_product_codes():
    """Recreate ig_product_codes from current titles (reads products, writes only the ig_ table)."""
    now = timezone.now()
    rows = [
        IgProductCode(code=code, product_id=pk, title=(title or "")[:512], built_at=now)
        for pk, title in Product.objects.values_list("pk", "title").iterator()
        if (code := title_code(title))
    ]
    with transaction.atomic():
        IgProductCode.objects.all().delete()
        IgProductCode.objects.bulk_create(rows, batch_size=1000)
    return len(rows)
