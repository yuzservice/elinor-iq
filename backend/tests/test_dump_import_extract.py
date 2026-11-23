from apps.integrations.elinor.dump_import.extract import _row


def test_levels_row_sort_order_from_order_column():
    # Real MariaDB dump schema for `levels` (7 columns):
    # 0: id
    # 1: title
    # 2: status
    # 3: min_order_amount_for_free_shipping
    # 4: order (sort_order)
    # 5: created_at
    # 6: updated_at
    row_7 = _row("levels", ["2", "طلایی", "1", "500000", "3", "2024-01-01", "2024-01-01"])
    assert row_7 == [2, "طلایی", 1, 3]


def test_levels_row_fallback_when_order_column_missing():
    # Legacy 4-column tuple:
    row_4 = _row("levels", ["3", "نقره‌ای", "1", "4"])
    assert row_4 == [3, "نقره‌ای", 1, 4]


def test_levels_row_null_order_defaults_to_zero():
    # 7-column tuple with NULL order:
    row_null = _row("levels", ["4", "برنزی", "1", "500000", "NULL", "2024-01-01", "2024-01-01"])
    assert row_null == [4, "برنزی", 1, 0]
