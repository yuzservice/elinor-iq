from apps.integrations.elinor.client import ElinorClient
from apps.integrations.elinor.parsers import extract_paginator, parse_datetime, unwrap_data


def test_unwrap_and_paginator_orders_light():
    payload = {
        "success": True,
        "data": {
            "orders": {
                "current_page": 2,
                "last_page": 5,
                "total": 118,
                "data": [{"id": 1}, {"id": 2}],
            }
        },
    }
    data = unwrap_data(payload)
    rows, current, last, total = extract_paginator(data, ("orders",))
    assert [row["id"] for row in rows] == [1, 2]
    assert current == 2
    assert last == 5
    assert total == 118


def test_parse_elinor_datetime():
    dt = parse_datetime("2026-08-30 18:12:04")
    assert dt is not None
    assert dt.year == 2026
    assert dt.month == 8
    assert dt.tzinfo is not None


def test_throttle_detection():
    client = ElinorClient.__new__(ElinorClient)

    class Resp:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    assert client._is_throttle(Resp(429, {}))
    assert client._is_throttle(Resp(422, {"message": "درخواست‌های شما بیش از حد مجاز است", "errors": ["x"]}))
    assert not client._is_throttle(Resp(422, {"message": "validation failed"}))
    assert not client._is_throttle(Resp(400, {"message": "no"}))
