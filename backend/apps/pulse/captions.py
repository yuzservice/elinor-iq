"""Product codes in Instagram captions. Rules: docs/elinor-pulse-architecture.md §4."""

import re
from dataclasses import dataclass

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
# Zernio separates lines with \n; the CSV export uses " ⏎ ".
_LINES = re.compile(r"\s*⏎\s*|\r?\n")
_LABELLED = re.compile(r"کد\s*محصول\s*[:：]\s*(?<![0-9])([0-9]{4})(?![0-9])")
_TRAILING = re.compile(r"(?<![0-9])([0-9]{4})\s*$")  # also «نیم بگ1143»
_PRICE = re.compile(r"قیمت\s*[:：]?\s*([0-9][0-9,٬]*)")


@dataclass(frozen=True)
class CaptionCode:
    code: str
    line: str
    price: int | None


def _clean(line):
    return line.replace("‏", "").replace("‎", "").translate(_DIGITS).strip()


def _price(line):
    match = _PRICE.search(line)
    if not match:
        return None
    digits = re.sub(r"[^0-9]", "", match.group(1))
    return int(digits) if digits else None


def parse_codes(caption):
    """Codes in caption order, without duplicates.

    1. «کدمحصول: 8504» (spacing variants); the product name is the line before it.
    2. The trailing 4 digits of a line whose next line contains «قیمت».
    """
    lines = [_clean(line) for line in _LINES.split(caption or "")]
    found = []
    seen = set()
    for index, line in enumerate(lines):
        following = lines[index + 1] if index + 1 < len(lines) else ""
        name = line
        match = _LABELLED.search(line)
        if match:
            previous = lines[index - 1] if index > 0 else ""
            name = previous if previous and not _LABELLED.search(previous) else line
        elif "قیمت" in following:
            match = _TRAILING.search(line)
        if not match or match.group(1) in seen:
            continue
        seen.add(match.group(1))
        found.append(CaptionCode(code=match.group(1), line=name[:512], price=_price(following) or _price(line)))
    return found
