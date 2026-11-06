import csv
import importlib
import re
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command
from django.db import connection
from django.db.migrations.operations import AddConstraint, AddIndex, CreateModel
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.products.models import Product, Variant
from apps.pulse import media, sync
from apps.pulse.captions import parse_codes
from apps.pulse.codes import rebuild_product_codes, title_code
from apps.pulse.models import (
    IgAccountDaily,
    IgMediaAsset,
    IgPost,
    IgPostProduct,
    IgPostSnapshot,
    IgProductCode,
    IgSyncRun,
)
from apps.pulse.shares import shares
from apps.pulse.zernio import ZernioClient, ZernioError

CSV_PATH = Path(__file__).parent / "fixtures" / "pulse" / "posts_100.csv"
PULSE_DIR = Path(__file__).resolve().parent.parent / "apps" / "pulse"
_ids = iter(range(700_000, 799_999))


@pytest.fixture
def pulse_on(settings, tmp_path):
    settings.PULSE_ENABLED = True
    settings.PULSE_MEDIA_ROOT = str(tmp_path)
    settings.PULSE_MEDIA_PROXY = ""
    settings.ZERNIO_API_KEY = "test-key"
    settings.ZERNIO_ACCOUNT_ID = "acc-1"
    return settings


def _product(title, **extra):
    return Product.objects.create(source_id=next(_ids), title=title, **extra)


# --- Caption parser on the real 100 captions ----------------------------------------------------


def test_parser_on_100_csv_captions():
    rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
    found = [[row.code for row in parse_codes(item["caption"])] for item in rows]
    assert len(rows) == 100
    assert sum(1 for codes in found if codes) == 88
    assert len({code for codes in found for code in codes}) == 137
    assert sum(1 for codes in found if len(codes) > 1) == 69
    assert found[0] == ["2527", "2557", "1616", "7685", "8504"]


def test_parser_patterns_and_prices():
    caption = "بلوز بافت نیم زیپ پلو 😍🫧\nکدمحصول: 8504\nقیمت:2,799,000✔️\n\nنیم بگ1143\nقیمت: 1,399,000✔️\n\nکدمحصول : 5205\nقیمت: ۹۹۹,۰۰۰\n\nکد محصول:8504\nقیمت: 1"
    codes = parse_codes(caption)
    assert [(row.code, row.price) for row in codes] == [("8504", 2_799_000), ("1143", 1_399_000), ("5205", 999_000)]
    assert codes[0].line.startswith("بلوز بافت")  # labelled code: the name is the line before
    assert codes[1].line == "نیم بگ1143"
    assert parse_codes("سال ۱۴۰۵ مبارک\nبدون کد") == []
    assert parse_codes("شماره 123456\nقیمت: 1") == []  # 6 digits are not a code


# --- Title codes ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_title_code_regex_and_shared_codes():
    assert title_code("بلوز بافت نیم زیپ پلو زنانه 8504 | الینور") == "8504"
    assert title_code("کیف 7130") == "7130"
    assert title_code("ست شومیز و شلوار 2890 | الینور") == "2890"
    assert title_code("بدون کد | الینور") is None
    assert title_code("کد 12345 | الینور") is None
    first, second = _product("بارانی چهار دکمه 2688 | الینور"), _product("بارانی چهار دکمه 2688 | الینور")
    trap = _product("ست شومیز و شلوار 2890 | الینور", barcode="1616")  # barcode is not the code
    assert rebuild_product_codes() == 3
    assert set(IgProductCode.objects.filter(code="2688").values_list("product_id", flat=True)) == {first.pk, second.pk}
    assert not IgProductCode.objects.filter(code="1616").exists()
    assert IgProductCode.objects.get(product_id=trap.pk).code == "2890"
    assert rebuild_product_codes() == 3  # rebuild is idempotent
    assert IgProductCode.objects.count() == 3


# --- Share rule -------------------------------------------------------------------------------


def test_share_rule_two_to_one():
    assert shares(1) == [1.0]
    assert [round(value * 100) for value in shares(2)] == [67, 33]
    assert [round(value * 100) for value in shares(5)] == [33, 17, 17, 17, 17]
    assert abs(sum(shares(5)) - 1) < 1e-9


# --- CSV import -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_csv_import_is_idempotent(pulse_on):
    sync.run_job(sync.JOB_IMPORT, lambda: sync.import_csv(CSV_PATH))
    snapshot = (IgPost.objects.count(), IgPostProduct.objects.count(), IgPost.objects.filter(is_brand_content=True).count())
    sync.run_job(sync.JOB_IMPORT, lambda: sync.import_csv(CSV_PATH))
    assert (IgPost.objects.count(), IgPostProduct.objects.count(), IgPost.objects.filter(is_brand_content=True).count()) == snapshot
    assert snapshot[0] == 100 and snapshot[2] == 12
    assert IgPost.objects.filter(is_brand_content=False).count() == 88
    assert IgPostProduct.objects.values("raw_code").distinct().count() == 137
    first = IgPost.objects.get(shortcode="DfZPAV2DW03")
    assert list(first.codes.values_list("raw_code", flat=True)) == ["2527", "2557", "1616", "7685", "8504"]
    assert first.media == "carousel" and first.product_type == "FEED" and first.views == 110057
    assert "\n" in first.caption and "⏎" not in first.caption
    assert IgSyncRun.objects.filter(job=sync.JOB_IMPORT, status=IgSyncRun.STATUS_SUCCESS).count() == 2


# --- Zernio client (mocked) --------------------------------------------------------------------


class FakeResponse:
    def __init__(self, status, payload=None, headers=None):
        self.status_code, self._payload, self.headers, self.text = status, payload, headers or {}, ""

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append((url, dict(params or {}), headers))
        return self.responses.pop(0)


def _item(shortcode, published="2026-11-05T18:30:00.000Z", caption="کیف جیر دوتیکه 7130\nقیمت: 1,399,000", views=100, cover=None):
    analytics = {"views": views, "reach": 50, "likes": 5, "comments": 1, "shares": 2, "saves": 3, "follows": None,
                 "profileViews": 4, "engagementRate": 2.13, "igReelsAvgWatchTime": 3466, "reelsSkipRate": 79.2,
                 "videoDurationSeconds": 12}
    return {
        "_id": f"z-{shortcode}", "content": caption, "publishedAt": published, "platformPostUrl": f"https://www.instagram.com/reel/{shortcode}/",
        "mediaType": "video", "mediaProductType": "REELS", "isAd": False, "analytics": analytics,
        "thumbnailUrl": cover or f"https://scontent-lhr6-1.cdninstagram.com/v/{shortcode}.jpg",
        "platforms": [{"platform": "instagram", "platformPostId": f"18{shortcode}", "analytics": analytics}],
    }


def _page(items, page=1, pages=1):
    return {"posts": items, "pagination": {"page": page, "limit": 50, "total": len(items), "pages": pages},
            "accounts": [{"_id": "acc-1", "username": "elinor_boutique", "followersCount": 899508}]}


def test_zernio_client_pages_auth_and_retry():
    session = FakeSession([
        FakeResponse(200, _page([_item("A")], 1, 2)),
        FakeResponse(429, headers={"Retry-After": "2"}),
        FakeResponse(200, _page([_item("B")], 2, 2)),
    ])
    sleeps = []
    client = ZernioClient(api_key="k", base_url="https://zernio.test/api/", session=session, sleep=sleeps.append)
    posts, accounts = client.instagram_posts("acc-1", "2026-10-06", "2026-11-06")
    assert [post["_id"] for post in posts] == ["z-A", "z-B"]
    assert accounts[0]["followersCount"] == 899508
    url, params, headers = session.calls[0]
    assert url == "https://zernio.test/api/v1/analytics"
    assert params["accountId"] == "acc-1" and params["platform"] == "instagram" and params["page"] == 1
    assert headers == {"Authorization": "Bearer k"}
    assert 2.0 in sleeps and client.requests_made == 3
    with pytest.raises(ZernioError):
        ZernioClient(api_key="", session=FakeSession([])).get("/v1/analytics")
    with pytest.raises(ZernioError):
        ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(401)]), sleep=lambda s: None).get("/v1/analytics")


def test_zernio_daily_reach_shape():
    payload = {"success": True, "metrics": {"reach": {"total": 2, "values": [{"date": "2026-11-05", "value": 139234}, {"date": "2026-11-06", "value": 110298}]}}}
    client = ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(200, payload)]), sleep=lambda s: None)
    assert client.daily_reach("acc-1", "2026-11-05", "2026-11-06") == {"2026-11-05": 139234, "2026-11-06": 110298}


def _client(items):
    return ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(200, _page(items))]), sleep=lambda s: None)


# --- Sync, covers, snapshots ---------------------------------------------------------------------


@pytest.mark.django_db
def test_sync_upserts_on_shortcode_and_waits_for_blocked_covers(pulse_on, monkeypatch):
    downloads = []
    monkeypatch.setattr(media, "download", lambda url, path, session=None: downloads.append(url) or f"{path}.jpg")
    zernio_cover = "https://media.zernio.com/covers/B.jpg"
    first = sync.run_sync(client=_client([_item("A"), _item("B", cover=zernio_cover)]))
    assert first["created"] == 2 and first["covers_ok"] == 1 and first["covers_waiting"] == 1
    assert downloads == [zernio_cover]  # the Meta CDN cover waits: no proxy configured
    second = sync.run_sync(client=_client([_item("A", views=900), _item("B", cover=zernio_cover)]))
    assert second["created"] == 0 and second["updated"] == 2
    post = IgPost.objects.get(shortcode="A")
    assert (post.views, post.skip_rate, post.duration_s, post.ig_media_id, post.zernio_id) == (900, 79.2, 12, "18A", "z-A")
    assert list(post.codes.values_list("raw_code", "caption_price")) == [("7130", 1_399_000)]
    assert IgPost.objects.count() == 2 and IgPostProduct.objects.count() == 2
    assert IgMediaAsset.objects.count() == 2
    assert pulse_on.ZERNIO_ACCOUNT_ID == IgPost.objects.first().account.zernio_account_id
    assert IgPost.objects.first().account.followers_count == 899508
    pulse_on.PULSE_MEDIA_PROXY = "http://proxy.test:3128"
    sync.run_sync(client=_client([_item("A")]))
    assert downloads[-1].startswith("https://scontent")  # with a proxy the Meta cover is fetched


@pytest.mark.django_db
def test_sync_replaces_csv_post_and_keeps_zernio_data_on_reimport(pulse_on, monkeypatch):
    monkeypatch.setattr(media, "download", lambda url, path, session=None: f"{path}.jpg")
    sync.import_csv(CSV_PATH)
    live = _item("DfZPAV2DW03", published="2026-11-06T09:00:00.000Z", views=198018)
    live["platformPostUrl"] = "https://www.instagram.com/p/DfZPAV2DW03/"
    sync.run_sync(client=_client([live]))
    sync.import_csv(CSV_PATH)
    post = IgPost.objects.get(shortcode="DfZPAV2DW03")
    assert (post.source, post.views, IgPost.objects.count()) == (IgPost.SOURCE_ZERNIO, 198018, 100)


@pytest.mark.django_db
def test_snapshot_window_reach_and_idempotence(pulse_on):
    now = datetime(2026, 11, 7, 1, 0, tzinfo=dt_timezone.utc)  # 04:30 Tehran on 11-07: snapshot of 11-06
    owner = sync.account()
    owner.followers_count = 899508
    owner.save()
    for shortcode, days_ago in (("new", 0), ("edge", 29), ("old", 30)):
        IgPost.objects.create(account=owner, shortcode=shortcode, url=f"https://www.instagram.com/p/{shortcode}/",
                              published_at=now - timedelta(days=days_ago + 1), views=10)
    reach = {"metrics": {"reach": {"values": [{"date": "2026-11-05", "value": 5}, {"date": "2026-11-06", "value": 7}]}}}
    client = ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(200, reach)] * 2), sleep=lambda s: None)
    counts = sync.run_snapshot(client=client, now=now)
    sync.run_snapshot(client=client, now=now)
    assert counts["date"] == "2026-11-06" and counts["post_snapshots"] == 2
    assert set(IgPostSnapshot.objects.values_list("post__shortcode", flat=True)) == {"new", "edge"}
    assert IgPostSnapshot.objects.count() == 2
    day = IgAccountDaily.objects.get(date="2026-11-06")
    assert (day.followers, day.reach) == (899508, 7)
    failing = ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(500)] * 4), sleep=lambda s: None)
    assert "reach_error" in sync.run_snapshot(client=failing, now=now)  # post snapshots still stored


@pytest.mark.django_db
def test_due_checks(pulse_on):
    assert sync.sync_due() and not sync.match_due()
    IgSyncRun.objects.create(job=sync.JOB_SYNC, status=IgSyncRun.STATUS_SUCCESS)
    assert not sync.sync_due() and sync.match_due()
    assert sync.sync_due(now=timezone.now() + timedelta(hours=3))
    IgSyncRun.objects.create(job=sync.JOB_MATCH, status=IgSyncRun.STATUS_SUCCESS)
    assert not sync.match_due()
    tehran_0010 = datetime(2026, 11, 6, 20, 40, tzinfo=dt_timezone.utc)  # 00:10 Tehran
    assert not sync.snapshot_due(now=tehran_0010)
    assert sync.snapshot_due(now=tehran_0010 + timedelta(minutes=30))


# --- Re-matching -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_unmatched_code_links_once_its_product_appears(pulse_on, monkeypatch):
    monkeypatch.setattr(media, "download", lambda url, path, session=None: f"{path}.jpg")
    sync.import_csv(CSV_PATH)
    _product("بلوز بافت نیم زیپ پلو زنانه 8504 | الینور", source_payload={"major_image": {"conversions": {"sm": "https://img.test/8504.jpg"}}, "purchase_price": 1})
    first = sync.run_match()
    assert "7685" in first["unmatched"] and first["matched"] == 1 and first["thumbs_ok"] == 1
    _product("کیف جیر بند سگک 7685 | الینور")
    second = sync.run_match()
    assert "7685" not in second["unmatched"] and second["matched"] == 2
    assert IgProductCode.objects.filter(code="7685").count() == 1
    assert IgMediaAsset.objects.get(kind=IgMediaAsset.KIND_PRODUCT).path.endswith(".jpg")


# --- Flag, isolation ----------------------------------------------------------------------------


@pytest.mark.django_db
def test_disabled_commands_do_nothing(settings):
    settings.PULSE_ENABLED = False
    for command, args in (("pulse_import_csv", [str(CSV_PATH)]), ("pulse_sync", []), ("pulse_snapshot", []), ("pulse_match_products", [])):
        out = StringIO()
        call_command(command, *args, stdout=out)
        assert sync.DISABLED in out.getvalue()
    assert IgPost.objects.count() == IgSyncRun.objects.count() == IgProductCode.objects.count() == 0


_WRITE = re.compile(r'^\s*(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+"?([a-z_]+)"?', re.IGNORECASE)


@pytest.mark.django_db
def test_pulse_never_writes_core_tables(pulse_on, monkeypatch):
    monkeypatch.setattr(media, "download", lambda url, path, session=None: f"{path}.jpg")
    product = _product("کیف جیر دوتیکه 7130 | الینور", source_payload={"major_image": {"conversions": {"sm": "https://img.test/7130.jpg"}}})
    Variant.objects.create(source_id=next(_ids), product=product, price=1_399_000)
    before = list(Product.objects.values_list("id", "title", "synced_at")) + list(Variant.objects.values_list("id", "price"))
    reach = {"metrics": {"reach": {"values": []}}}
    with CaptureQueriesContext(connection) as queries:
        sync.run_job(sync.JOB_IMPORT, lambda: sync.import_csv(CSV_PATH))
        sync.run_job(sync.JOB_SYNC, lambda: sync.run_sync(client=_client([_item("A")])))
        sync.run_job(sync.JOB_MATCH, sync.run_match)
        session = FakeSession([FakeResponse(200, reach)])
        sync.run_job(sync.JOB_SNAPSHOT, lambda: sync.run_snapshot(client=ZernioClient(api_key="k", base_url="https://z/api", session=session, sleep=lambda s: None)))
    written = {match.group(1) for query in queries.captured_queries if (match := _WRITE.match(query["sql"]))}
    assert written and all(table.startswith("ig_") for table in written), written
    after = list(Product.objects.values_list("id", "title", "synced_at")) + list(Variant.objects.values_list("id", "price"))
    assert before == after


def test_migrations_create_only_ig_tables():
    migration = importlib.import_module("apps.pulse.migrations.0001_initial").Migration
    for operation in migration.operations:
        assert isinstance(operation, (CreateModel, AddIndex, AddConstraint)), operation
        if isinstance(operation, CreateModel):
            assert operation.options["db_table"].startswith("ig_")


def test_pulse_never_imports_the_elinor_client_or_ai():
    for path in PULSE_DIR.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "apps.integrations" not in text, path
        assert "anthropic" not in text.lower(), path
