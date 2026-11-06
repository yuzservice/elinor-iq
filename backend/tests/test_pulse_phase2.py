import importlib
import os
import re
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.products.models import Product, Variant
from apps.pulse import analytics, brief, texts
from apps.pulse.backfill import run_backfill
from apps.pulse.models import IgDailyBrief, IgDailyTask, IgMediaAsset, IgPost, IgPostProduct, IgPostSnapshot, IgProductCode
from apps.pulse.zernio import ZernioClient
from tests.test_pulse import FakeResponse, FakeSession

_ids = iter(range(800_000, 899_999))
NOW = datetime(2026, 11, 6, 6, 0, tzinfo=dt_timezone.utc)  # 09:30 Tehran, Friday 15 Aban
_LATIN_DIGIT = re.compile(r"[0-9]")


@pytest.fixture
def pulse(settings, tmp_path):
    settings.PULSE_ENABLED = True
    settings.PULSE_MEDIA_ROOT = str(tmp_path)
    return settings


def _account():
    from apps.pulse.sync import account

    return account()


def _post(hours_ago=None, at=None, views=1000, reel=True, media=None, skip=None, shares=10, saves=5, er=1.0,
          caption="کیف جیر دوتیکه 7130\nقیمت: 1,399,000", now=NOW, codes=None, zid=None):
    at = at or now - timedelta(hours=hours_ago)
    post = IgPost.objects.create(
        account=_account(), shortcode=f"s{next(_ids)}", url="https://www.instagram.com/p/x/", published_at=at,
        product_type="REELS" if reel else "FEED", media=media or ("video" if reel else "carousel"), caption=caption,
        views=views, reach=views // 2, shares=shares, saves=saves, er=er, skip_rate=skip, zernio_id=zid,
    )
    for position, code in enumerate(codes or []):
        IgPostProduct.objects.create(post=post, position=position, raw_code=code)
    post.is_brand_content = not codes
    post.save(update_fields=["is_brand_content"])
    return post


def _user(role):
    return get_user_model().objects.create_user(username=f"u{next(_ids)}", password="secret-pass", role=role)


def _api(role):
    client = APIClient()
    client.force_login(_user(role))
    return client


# --- Access -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_content_role_sees_only_pulse(pulse):
    client = _api("content")
    assert client.get("/api/pulse/home/").status_code == 200
    for path in ("/api/sales/kpis/", "/api/customers/", "/api/products/", "/api/home/", "/api/calls/tasks/"):
        assert client.get(path).status_code == 403, path
    assert client.get("/api/auth/me/").json()["features"] == {"pulse": True}


@pytest.mark.django_db
def test_pulse_roles_and_flag(pulse):
    assert _api("sales_agent").get("/api/pulse/home/").status_code == 403
    for role in ("manager", "analyst", "staff"):
        assert _api(role).get("/api/pulse/home/").status_code == 403, role
        assert _api(role).get("/api/auth/me/").json()["features"] == {"pulse": False}
    admin = _api("admin")
    assert admin.get("/api/pulse/status/").status_code == 200
    assert _api("super_admin").get("/api/auth/me/").json()["features"] == {"pulse": True}
    pulse.PULSE_ENABLED = False
    for path in ("/api/pulse/home/", "/api/pulse/posts/", "/api/pulse/status/", "/api/pulse/media/1/"):
        assert admin.get(path).status_code == 404, path
    assert admin.get("/api/auth/me/").json()["features"] == {"pulse": False}
    assert _api("content").get("/api/pulse/home/").status_code == 404
    assert APIClient().get("/api/pulse/home/").status_code in (401, 403, 404)


@pytest.mark.django_db
def test_role_migration_changes_choices_only():
    migration = importlib.import_module("apps.accounts.migrations.0004_content_role").Migration
    assert [type(op).__name__ for op in migration.operations] == ["AlterField"]
    out = StringIO()
    call_command("sqlmigrate", "accounts", "0004", stdout=out)
    assert "(no-op)" in out.getvalue() and "ALTER" not in out.getvalue().upper().replace("ALTER FIELD", "")


def test_pulse_migrations_touch_only_ig_tables():
    from django.db.migrations.operations import AddConstraint, AddField, AddIndex, CreateModel

    for name in ("0001_initial", "0002_phase2_briefs_tasks"):
        for operation in importlib.import_module(f"apps.pulse.migrations.{name}").Migration.operations:
            assert isinstance(operation, (CreateModel, AddIndex, AddConstraint, AddField)), operation
            if isinstance(operation, CreateModel):
                assert operation.options["db_table"].startswith("ig_")


# --- Medians and scores -------------------------------------------------------------------------


@pytest.mark.django_db
def test_medians_exclude_fresh_and_fall_back_to_90_days():
    for views, hours in ((100, 50), (200, 60), (300, 70), (400, 80), (500, 90)):
        _post(hours, views=views)
    _post(10, views=99_999)  # fresh: not in the median
    for views, days in ((1000, 10), (3000, 40), (5000, 60), (7000, 70), (9000, 80)):
        _post(days * 24, views=views, reel=False)
    data = analytics.load(NOW)
    assert data.medians["reel"] == 300 and data.median_window["reel"] == 30
    assert data.medians["slide"] == 5000 and data.median_window["slide"] == 90  # 1 slide in 30 days < 5
    fresh = IgPost.objects.get(views=99_999)
    assert data.fresh(fresh) and data.score(fresh) == round(99_999 / 300, 2)


def test_score_bands():
    assert [analytics.band(score) for score in (1.5, 1.49, 1.0, 0.99, 0.7, 0.69, None)] == ["great", "good", "good", "mid", "mid", "bad", None]


@pytest.mark.django_db
def test_groups_reel_vs_slide():
    assert analytics.group_of(_post(50, reel=True)) == "reel"
    assert analytics.group_of(_post(50, reel=False, media="image")) == "slide"
    assert analytics.group_of(_post(50, reel=False, media="video")) == "slide"  # a FEED video is not a reel


@pytest.mark.django_db
def test_tehran_day_and_hour_across_utc_midnight():
    late = _post(at=datetime(2026, 11, 4, 21, 0, tzinfo=dt_timezone.utc), views=1000)  # 00:30 Tehran on 11-05
    _post(at=datetime(2026, 11, 4, 20, 0, tzinfo=dt_timezone.utc), views=10)  # 23:30 Tehran on 11-04
    moment = analytics.local(late.published_at)
    assert (moment.date().isoformat(), moment.hour) == ("2026-11-05", 0)
    assert analytics.weekday_index(moment.date()) == 5  # Thursday (Saturday = 0)
    cards = {card["key"]: card for card in analytics.kpis(analytics.load(NOW))["cards"]}
    assert cards["views"]["spark"][-2:] == [10, 1000]  # 11-04 then 11-05 (yesterday is the newest point)


# --- Task rules ---------------------------------------------------------------------------------


def _baseline(n=6, views=1000):
    """Non-fresh reels at noon so medians exist."""
    for index in range(n):
        _post(at=NOW.replace(hour=8, minute=30) - timedelta(days=3 + index), views=views, skip=60)  # 12:00 Tehran


@pytest.mark.django_db
def test_rule_first_second():
    _baseline()
    assert brief.rule_first_second(analytics.load(NOW)) is None
    _post(60, views=500, skip=81, caption="بلوز دورس دایموند\nکدمحصول: 2527\nقیمت: 1")
    title, reason = brief.rule_first_second(analytics.load(NOW))
    assert "بلوز دورس دایموند" in title and "۸۱٪" in reason
    _post(30, views=500, skip=95)  # fresh: ignored
    assert "۸۱٪" in brief.rule_first_second(analytics.load(NOW))[1]


@pytest.mark.django_db
def test_rule_repeat_winner_uses_non_fresh_posts_of_three_days_and_never_repeats():
    _baseline()
    _post(at=NOW - timedelta(days=1), views=50_000)  # fresh yesterday post: ignored however big
    assert brief.rule_repeat_winner(analytics.load(NOW)) is None
    _post(96, views=40_000)  # 4 days old: outside the 3-day window
    assert brief.rule_repeat_winner(analytics.load(NOW)) is None
    winner = _post(60, views=2000, skip=39, caption="ریل قسطی اسنپ‌پی 😍")
    title, reason, post_id = brief.rule_repeat_winner(analytics.load(NOW))
    assert post_id == winner.pk and "«ریل قسطی اسنپ‌پی»" in title and "۲ برابر" in reason and "۳۹٪" in reason
    IgDailyTask.objects.create(date=timezone.localdate(NOW) - timedelta(days=2), position=0, rule="repeat_winner",
                               title="x", reason="y", post=winner)
    assert brief.rule_repeat_winner(analytics.load(NOW)) is None  # named the day before yesterday
    IgDailyTask.objects.all().update(date=timezone.localdate(NOW) - timedelta(days=3))
    assert brief.rule_repeat_winner(analytics.load(NOW))[2] == winner.pk  # 3 days ago: may be named again


@pytest.mark.django_db
def test_rule_night_posting():
    for days in range(8, 14):
        _post(at=NOW.replace(hour=8, minute=30) - timedelta(days=days), views=2000)  # noon, before last week
    for days in range(1, 6):
        _post(at=NOW.replace(hour=17, minute=30) - timedelta(days=days), views=1000)  # 21:00 Tehran, last week
    title, reason = brief.rule_night_posting(analytics.load(NOW))
    assert "۱۲ ظهر" in title and "شب" in reason
    IgPost.objects.filter(views=1000).update(views=1950)  # gap under 10 %
    assert brief.rule_night_posting(analytics.load(NOW)) is None


@pytest.mark.django_db
def test_rule_no_slide():
    _baseline()
    for days in range(10, 16):
        _post(days * 24, views=4000, reel=False)
    title, reason = brief.rule_no_slide(analytics.load(NOW))
    assert "اسلاید" in title and "۴ برابر" in reason
    _post(30, reel=False)
    assert brief.rule_no_slide(analytics.load(NOW)) is None


@pytest.mark.django_db
def test_rule_neglected_product():
    _baseline()
    Product.objects.create(source_id=next(_ids), title="بافت یقه اسکی زنانه 1234 | الینور")
    from apps.pulse.codes import rebuild_product_codes

    rebuild_product_codes()
    _post(20 * 24, views=50_000, codes=["1234"])
    title, reason = brief.rule_neglected_product(analytics.load(NOW))
    assert "بافت یقه اسکی زنانه" in title and "۲۰ روز" in reason
    _post(5 * 24, views=100, codes=["1234"])
    assert brief.rule_neglected_product(analytics.load(NOW)) is None


@pytest.mark.django_db
def test_rule_friday():
    thursday = datetime(2026, 11, 5, 6, 0, tzinfo=dt_timezone.utc)
    for week in range(1, 4):
        friday = datetime(2026, 11, 6, 8, 30, tzinfo=dt_timezone.utc) - timedelta(days=7 * week)
        _post(at=friday, views=5000, now=thursday)
        _post(at=friday - timedelta(days=2), views=500, now=thursday)
    assert brief.rule_friday(analytics.load(thursday)) is not None
    assert brief.rule_friday(analytics.load(NOW)) is None  # NOW is a Friday, not Thursday


@pytest.mark.django_db
def test_tasks_priority_top_three_and_idempotent_brief(pulse):
    _baseline()
    _post(60, views=500, skip=85)  # first_second
    _post(55, views=5000, skip=40)  # repeat_winner (non-fresh, within 3 days)
    for days in range(1, 7):
        _post(at=NOW.replace(hour=17, minute=30) - timedelta(days=days), views=300)  # night_posting
    tasks = brief.tasks_for(analytics.load(NOW))
    assert [rule for rule, *_ in tasks] == ["first_second", "repeat_winner", "night_posting"]
    first = brief.run_daily_brief(now=NOW)
    again = brief.run_daily_brief(now=NOW)
    assert first["created"] and not again["created"]
    assert IgDailyBrief.objects.count() == 1 and IgDailyTask.objects.count() == 3
    text = IgDailyBrief.objects.get().text
    assert text.count(".") <= 4 and "امروز:" in text
    assert brief.brief_due(now=NOW) is False


@pytest.mark.django_db
def test_brief_without_posts_yesterday(pulse):
    _baseline()
    _post(60, views=500, skip=85)
    text = brief.brief_text(analytics.load(NOW), brief.tasks_for(analytics.load(NOW)))
    assert text.startswith("دیروز پستی منتشر نشد.") and "امروز:" in text


@pytest.mark.django_db
def test_generated_texts_have_no_em_dash_or_latin_digits(pulse):
    _baseline()
    _post(60, views=500, skip=85, caption="ریل 2024 — تست 7130\nقیمت: 1")
    _post(at=NOW - timedelta(days=1), views=5000, skip=40)
    for days in range(1, 4):
        _post(at=NOW.replace(hour=17, minute=30) - timedelta(days=days), views=300)
    brief.run_daily_brief(now=NOW)
    data = analytics.load(NOW)
    texts_out = [IgDailyBrief.objects.get().text] + [t.title + t.reason for t in IgDailyTask.objects.all()]
    texts_out += [analytics.autopsy(data, post, 3) for post in data.posts]
    for text in texts_out:
        assert "—" not in text and not _LATIN_DIGIT.search(text) and "شیر" not in text, text
    assert texts.compact(221_000) == "۲۲۱ هزار" and texts.compact(1_240_000) == "۱٫۲ میلیون"


@pytest.mark.django_db
def test_autopsy_rules():
    _baseline(views=1000)
    for days in range(5, 11):
        _post(days * 24, views=5000, reel=False)
    data = analytics.load(NOW)
    reel = _post(at=NOW.replace(hour=8, minute=30) - timedelta(days=3), skip=60, codes=["1", "2", "3"])
    data = analytics.load(NOW)
    text = analytics.autopsy(data, reel, 3)
    assert "۶۰٪" in text and "ظهر" in text and "۳ محصول" in text
    slide = _post(80, reel=False, codes=[])
    assert "اسلاید" in analytics.autopsy(analytics.load(NOW), slide, 0)
    assert "محتوای برند" in analytics.autopsy(analytics.load(NOW), slide, 0)
    fresh = _post(5)
    assert analytics.autopsy(analytics.load(NOW), fresh, 1) == texts.autopsy_fresh()


# --- API safety ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_no_response_leaks_source_payload_or_purchase_price(pulse, tmp_path):
    product = Product.objects.create(source_id=next(_ids), title="کیف جیر دو تیکه زنانه 7130 | الینور",
                                     source_payload={"purchase_price": 777_000, "major_image": {"conversions": {"sm": "https://x/sm.jpg"}}})
    Variant.objects.create(source_id=next(_ids), product=product, price=1_399_000, final_price=1_299_000)
    IgProductCode.objects.create(code="7130", product=product)
    now = timezone.now()
    post = _post(at=now - timedelta(days=3), codes=["7130"], now=now)
    _post(at=now - timedelta(days=1), codes=[], now=now)
    IgDailyBrief.objects.create(date=timezone.localdate(), text="خلاصه")
    IgDailyTask.objects.create(date=timezone.localdate(), position=0, rule="x", title="کار", reason="دلیل")
    client = _api("admin")
    for path in ("/api/pulse/status/", "/api/pulse/home/", "/api/pulse/posts/", f"/api/pulse/posts/{post.pk}/",
                 "/api/pulse/products/", "/api/pulse/products/7130/", "/api/pulse/hours/", "/api/pulse/hours/?group=all"):
        response = client.get(path)
        assert response.status_code == 200, path
        body = response.content.decode()
        assert "source_payload" not in body and "purchase_price" not in body and "777000" not in body, path
    products = client.get("/api/pulse/products/").json()
    assert products["matched"][0]["price"] == 1_299_000 and products["matched"][0]["title"] == "کیف جیر دو تیکه زنانه"
    detail = client.get(f"/api/pulse/posts/{post.pk}/").json()
    assert detail["products"][0]["share"] == 1.0 and detail["products"][0]["matched"]


@pytest.mark.django_db
def test_task_toggle_and_media_serving(pulse, tmp_path):
    task = IgDailyTask.objects.create(date=timezone.localdate(), position=0, rule="x", title="کار", reason="دلیل")
    client = _api("content")
    assert client.post(f"/api/pulse/tasks/{task.pk}/toggle/").json()["done"] is True
    task.refresh_from_db()
    assert task.done and task.done_by.role == "content"
    assert client.post(f"/api/pulse/tasks/{task.pk}/toggle/").json()["done"] is False
    (tmp_path / "covers").mkdir()
    (tmp_path / "covers" / "abc.jpg").write_bytes(b"jpg")
    good = IgMediaAsset.objects.create(kind=IgMediaAsset.KIND_COVER, key="abc", path="covers/abc.jpg", status=IgMediaAsset.STATUS_OK)
    evil = IgMediaAsset.objects.create(kind=IgMediaAsset.KIND_COVER, key="evil", path="../../etc/passwd", status=IgMediaAsset.STATUS_OK)
    response = client.get(f"/api/pulse/media/{good.pk}/")
    assert response.status_code == 200 and b"".join(response.streaming_content) == b"jpg"
    assert "max-age" in response["Cache-Control"]
    assert client.get(f"/api/pulse/media/{evil.pk}/").status_code == 404


# --- Backfill ------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_backfill_is_idempotent_and_keeps_our_snapshots(pulse):
    post = _post(at=datetime(2026, 11, 4, 9, 0, tzinfo=dt_timezone.utc), views=900, zid="z-1")
    IgPostSnapshot.objects.create(post=post, date="2026-11-05", views=111)  # our own daily row
    _post(at=datetime(2026, 9, 1, 9, 0, tzinfo=dt_timezone.utc), views=5)  # no Zernio id: skipped
    rows = {"timeline": [{"date": "2026-11-05", "platform": "instagram", "views": 999}, {"date": "2026-11-06", "platform": "instagram", "views": 1200, "profileViews": 3}]}

    def client():
        return ZernioClient(api_key="k", base_url="https://z/api", session=FakeSession([FakeResponse(200, rows)]), sleep=lambda s: None)

    first = run_backfill(client=client(), now=NOW)
    assert (first["created"], first["kept"], first["no_id"]) == (1, 1, 1)
    assert IgPostSnapshot.objects.get(post=post, date="2026-11-05").views == 111  # never overwritten
    new = IgPostSnapshot.objects.get(post=post, date="2026-11-06")
    assert (new.views, new.profile_views, new.source) == (1200, 3, IgPostSnapshot.SOURCE_TIMELINE)
    second = run_backfill(client=client(), now=NOW)  # same day: window already read today
    assert second["posts"] == 0 and IgPostSnapshot.objects.filter(post=post).count() == 2
    third = run_backfill(client=client(), now=NOW + timedelta(days=1))
    assert third["created"] == 0 and IgPostSnapshot.objects.filter(post=post).count() == 2


# --- Phase 2.1 --------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_fresh_posts_never_get_a_score_in_generated_text(pulse):
    for days in range(5, 11):
        _post(at=NOW.replace(hour=8, minute=30) - timedelta(days=days), views=1000, skip=60)  # older than 3 days
    big = _post(at=NOW - timedelta(hours=20), views=90_000, shares=40, caption="شلوار بگ موهر🍂😍")
    _post(at=NOW - timedelta(hours=22), views=300)
    data = analytics.load(NOW)
    text = brief.brief_text(data, brief.tasks_for(data))
    assert "«شلوار بگ موهر»" in text and "هنوز بالا می‌روند" in text and "۴۰ ارسال" in text
    assert "برابر" not in text and "×" not in text, text
    assert "برابر" not in analytics.autopsy(data, big, 1)
    for task in brief.tasks_for(data):
        assert "شلوار بگ موهر" not in task[1] + task[2]


@pytest.mark.django_db
def test_weakest_post_is_non_fresh_from_last_three_days():
    _baseline(views=1000)
    _post(96, views=10, caption="خیلی قدیمی")  # 4 days: ignored
    _post(30, views=10, caption="تازه")  # fresh: ignored
    data = analytics.load(NOW)
    assert brief._weakest_recent(data) == (None, None)
    weak = _post(60, views=400, skip=82, caption="ریل ضعیف 2527")
    score, post = brief._weakest_recent(analytics.load(NOW))
    assert post == weak and score == 0.4
    text = brief.brief_text(analytics.load(NOW), [])
    assert "«ریل ضعیف»" in text and "۸۲٪" in text


@pytest.mark.django_db
def test_same_age_comparison_needs_five_days(pulse):
    _post(at=NOW - timedelta(hours=20), views=6000)
    assert "٪" not in brief.brief_text(analytics.load(NOW), []).split(".")[0]  # no history at the same age yet
    for days in range(2, 7):
        post = _post(at=NOW.replace(hour=8, minute=30) - timedelta(days=days), views=9999)
        IgPostSnapshot.objects.create(post=post, date=analytics.local(post.published_at).date(), views=3000)
    first = brief.brief_text(analytics.load(NOW), []).split(".")[0]
    assert "۱۰۰٪ بیشتر" in first and "در همین سن" in first


def test_post_name_strips_emoji_code_and_price():
    assert texts.post_name("شلوار بگ موهر🍂😍") == "شلوار بگ موهر"
    assert texts.post_name("بلوز دورس دایموند 2527") == "بلوز دورس دایموند"
    assert texts.post_name("نیم بگ1143\nقیمت: 1,399,000✔️") == "نیم بگ"
    assert texts.post_name("😍🫧\nپالتو یقه ایستاده 1616 قیمت: 3,999,000✔️") == "پالتو یقه ایستاده"
    assert texts.post_name("کدمحصول : 5205\nکیف جیر") == "کیف جیر"


@pytest.mark.django_db
def test_full_refresh_turns_csv_posts_into_zernio_posts_without_duplicates(pulse, monkeypatch):
    from apps.pulse import media, sync
    from tests.test_pulse import CSV_PATH, _client, _item

    monkeypatch.setattr(media, "download", lambda url, path, session=None: f"{path}.jpg")
    pulse.ZERNIO_API_KEY, pulse.ZERNIO_ACCOUNT_ID = "k", "acc-1"
    sync.import_csv(CSV_PATH)
    old = _item("DfZPAV2DW03", published="2026-09-29T09:00:00.000Z", views=123_456)
    old["platformPostUrl"] = "https://www.instagram.com/p/DfZPAV2DW03/"
    first = sync.run_sync(client=_client([old]), days=90)
    second = sync.run_sync(client=_client([old]), days=90)
    post = IgPost.objects.get(shortcode="DfZPAV2DW03")
    assert (first["csv_to_zernio"], second["csv_to_zernio"], first["days"]) == (1, 0, 90)
    assert (post.source, post.views, post.zernio_id, IgPost.objects.count()) == ("zernio", 123_456, "z-DfZPAV2DW03", 100)
    assert IgMediaAsset.objects.filter(kind=IgMediaAsset.KIND_COVER, key="DfZPAV2DW03").count() == 1


# --- Covers through the relay ---------------------------------------------------------------------

import logging  # noqa: E402

from apps.pulse import covers, media  # noqa: E402

META = "https://scontent-lhr6-1.cdninstagram.com/v/t51/cover.jpg?stp=x&oe={oe}"


def _oe(delta):
    return format(int((timezone.now() + delta).timestamp()), "X")


class ImageResponse:
    status_code = 200
    headers = {"Content-Type": "image/jpeg"}
    text = ""

    def iter_content(self, size):
        yield b"\xff\xd8jpeg-bytes"


class RelaySession:
    def __init__(self, response=None):
        self.calls, self.response = [], response or ImageResponse()

    def get(self, url, params=None, headers=None, timeout=None, stream=False):
        self.calls.append({"url": url, "params": params, "headers": headers})
        return self.response


@pytest.fixture
def relay(pulse):
    pulse.PULSE_COVER_RELAY_URL, pulse.PULSE_COVER_RELAY_TOKEN = "https://relay.test", "tok-SECRET-123"
    return pulse


@pytest.mark.django_db
def test_meta_cover_goes_through_relay_with_token_header_only(relay, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    post = _post(50)
    url = META.format(oe=_oe(timedelta(days=2)))
    media.queue(IgMediaAsset.KIND_COVER, post.shortcode, url)
    session = RelaySession()
    sleeps = []
    assert media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=session, sleep=sleeps.append) == (1, 0, 0)
    call = session.calls[0]
    assert call["url"] == "https://relay.test/" and call["params"] == {"url": url}
    assert call["headers"] == {"X-Relay-Token": "tok-SECRET-123"}
    assert "tok-SECRET-123" not in call["url"] + str(call["params"]) and "tok-SECRET-123" not in caplog.text
    asset = IgMediaAsset.objects.get(key=post.shortcode)
    assert asset.status == "ok" and (tmp_path / asset.path).read_bytes().startswith(b"\xff\xd8")
    bad = RelaySession(type("R", (), {"status_code": 403, "headers": {}, "text": "forbidden"})())
    media.queue(IgMediaAsset.KIND_COVER, "other12", url)
    media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=bad, sleep=lambda s: None)
    failed = IgMediaAsset.objects.get(key="other12")
    assert failed.status == "failed" and failed.error == "relay 403: forbidden" and "tok-SECRET" not in failed.error
    assert _api("admin").get("/api/pulse/status/").json()["covers"]["last_relay_error"] == "relay 403: forbidden"


@pytest.mark.django_db
def test_relay_rate_limit_two_per_second(relay):
    for index in range(3):
        media.queue(IgMediaAsset.KIND_COVER, f"code{index}x", META.format(oe=_oe(timedelta(days=1))) + str(index))
    sleeps = []
    media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=RelaySession(), sleep=sleeps.append)
    assert len(sleeps) == 2 and all(0 < pause <= 0.5 for pause in sleeps)


@pytest.mark.django_db
def test_non_meta_cover_is_never_downloaded_and_keeps_the_meta_url(relay):
    post = _post(50)
    zernio = "https://storage.zernio.test/covers/x.jpg"
    media.queue(IgMediaAsset.KIND_COVER, "onlyzernio", zernio)
    assert IgMediaAsset.objects.get(key="onlyzernio").status == media.STATUS_SKIPPED
    meta = META.format(oe=_oe(timedelta(days=1)))
    media.queue(IgMediaAsset.KIND_COVER, post.shortcode, meta)
    media.queue(IgMediaAsset.KIND_COVER, post.shortcode, zernio)  # later sync sees Zernio's copy
    asset = IgMediaAsset.objects.get(key=post.shortcode)
    assert asset.source_url == meta and asset.status == "pending"
    session = RelaySession()
    media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=session, sleep=lambda s: None)
    assert [call["params"]["url"] for call in session.calls] == [meta]


@pytest.mark.django_db
def test_expired_meta_link_stops_retries(relay):
    media.queue(IgMediaAsset.KIND_COVER, "expired1", META.format(oe=_oe(-timedelta(hours=1))))
    session = RelaySession()
    assert media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=session, sleep=lambda s: None) == (0, 0, 0)
    assert session.calls == [] and IgMediaAsset.objects.get(key="expired1").status == media.STATUS_EXPIRED
    assert media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=session, sleep=lambda s: None) == (0, 0, 0)


@pytest.mark.django_db
def test_without_relay_covers_stay_pending_without_errors(pulse):
    pulse.PULSE_COVER_RELAY_URL = pulse.PULSE_COVER_RELAY_TOKEN = ""
    media.queue(IgMediaAsset.KIND_COVER, "waiting1", META.format(oe=_oe(timedelta(days=1))))
    session = RelaySession()
    assert media.fetch_pending(IgMediaAsset.KIND_COVER, "covers", session=session, sleep=lambda s: None) == (0, 0, 1)
    asset = IgMediaAsset.objects.get(key="waiting1")
    assert session.calls == [] and asset.status == "pending" and asset.error == ""
    status = _api("admin").get("/api/pulse/status/").json()["covers"]
    assert status["relay_configured"] is False and status["pending"] == 1


@pytest.mark.django_db
def test_cover_export_and_import_by_shortcode(pulse, tmp_path):
    source_root, target_root = tmp_path / "src", tmp_path / "dst"
    (source_root / "covers").mkdir(parents=True)
    known, other = _post(50), _post(60)
    for post in (known, other):
        (source_root / "covers" / f"{post.shortcode}.jpg").write_bytes(post.shortcode.encode())
        IgMediaAsset.objects.create(kind=IgMediaAsset.KIND_COVER, key=post.shortcode, path=f"covers/{post.shortcode}.jpg", status="ok")
    pulse.PULSE_MEDIA_ROOT = str(source_root)
    archive = str(tmp_path / "covers.tar.gz")
    assert covers.export_covers(archive)["exported"] == 2
    # Another environment: same posts known except `other`, and one cover already there.
    IgMediaAsset.objects.all().delete()
    other.delete()
    (target_root / "covers").mkdir(parents=True)
    pulse.PULSE_MEDIA_ROOT = str(target_root)
    first = covers.import_covers(archive)
    assert first == {"imported": 1, "kept": 0, "unknown": 1, "small": 0}  # fake bytes: no small copy, cover still ok
    asset = IgMediaAsset.objects.get(key=known.shortcode)
    assert asset.status == "ok" and (target_root / asset.path).read_bytes() == known.shortcode.encode()
    (target_root / asset.path).write_bytes(b"newer local file")
    assert covers.import_covers(archive) == {"imported": 0, "kept": 1, "unknown": 1, "small": 0}  # never overwrites
    assert (target_root / asset.path).read_bytes() == b"newer local file"
    folder = tmp_path / "folder"
    covers.export_covers(str(folder))
    assert sorted(path.name for path in folder.iterdir()) == [f"{known.shortcode}.jpg"]



# --- Phase 2.2: small list copies -------------------------------------------------------------------

from io import BytesIO  # noqa: E402

from PIL import Image  # noqa: E402


def _jpeg(width=2086, height=3702, orientation=None):
    image = Image.new("RGB", (width, height), (200, 120, 60))
    buffer = BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation  # Orientation
        exif[0x010F] = "Camera"  # Make
        image.save(buffer, "JPEG", exif=exif.tobytes())
    else:
        image.save(buffer, "JPEG")
    return buffer.getvalue()


def _cover(tmp_path, shortcode, data):
    (tmp_path / "covers").mkdir(exist_ok=True)
    (tmp_path / "covers" / f"{shortcode}.jpg").write_bytes(data)
    return IgMediaAsset.objects.create(kind=IgMediaAsset.KIND_COVER, key=shortcode, path=f"covers/{shortcode}.jpg", status="ok")


@pytest.mark.django_db
def test_small_copy_is_600px_keeps_ratio_strips_exif_and_is_made_once(pulse, tmp_path):
    asset = _cover(tmp_path, "abc12", _jpeg())
    assert media.make_small(asset)
    asset.refresh_from_db()
    assert asset.small_path == "covers/abc12.sm.jpg" and asset.small_error == ""
    with Image.open(tmp_path / asset.small_path) as small:
        assert small.width == 600 and small.height == round(3702 * 600 / 2086)
        assert not small.getexif() and "exif" not in small.info and small.info.get("progressive") == 1
    stamp = (tmp_path / asset.small_path).stat().st_mtime_ns
    assert covers.make_missing_small_covers() == {"created": 0, "had": 1, "failed": 0}
    assert (tmp_path / asset.small_path).stat().st_mtime_ns == stamp
    rotated = _cover(tmp_path, "rot90", _jpeg(800, 400, orientation=6))  # EXIF: rotate 90 degrees
    media.make_small(rotated)
    with Image.open(tmp_path / IgMediaAsset.objects.get(key="rot90").small_path) as small:
        assert (small.width, small.height) == (400, 800) and not small.getexif()


@pytest.mark.django_db
def test_failed_small_copy_keeps_the_cover_ok(pulse, tmp_path):
    asset = _cover(tmp_path, "broken1", b"not an image")
    assert media.make_small(asset) is False
    asset.refresh_from_db()
    assert asset.status == "ok" and asset.small_path == "" and asset.small_error
    assert covers.make_missing_small_covers() == {"created": 0, "had": 0, "failed": 1}


@pytest.mark.django_db
def test_import_makes_small_copies_and_reimport_changes_nothing(pulse, tmp_path):
    post = _post(50)
    folder = tmp_path / "export"
    folder.mkdir()
    (folder / f"{post.shortcode}.jpg").write_bytes(_jpeg(1200, 1500))
    pulse.PULSE_MEDIA_ROOT = str(tmp_path / "media")
    assert covers.import_covers(str(folder)) == {"imported": 1, "kept": 0, "unknown": 0, "small": 1}
    asset = IgMediaAsset.objects.get(key=post.shortcode)
    assert asset.small_path.endswith(".sm.jpg") and (tmp_path / "media" / asset.small_path).is_file()
    assert covers.import_covers(str(folder)) == {"imported": 0, "kept": 1, "unknown": 0, "small": 0}
    exported = covers.export_covers(str(tmp_path / "again"))
    assert exported["exported"] == 1 and not any(name.endswith(".sm.jpg") for name in os.listdir(tmp_path / "again"))


@pytest.mark.django_db
def test_lists_use_small_copy_detail_has_both_and_sm_falls_back(pulse, tmp_path):
    post = _post(50)
    with_small = _cover(tmp_path, post.shortcode, _jpeg(1200, 1500))
    media.make_small(with_small)
    client = _api("admin")
    card = client.get("/api/pulse/posts/").json()["results"][0]
    assert card["thumb"] == f"/api/pulse/media/{with_small.pk}/sm/"
    detail = client.get(f"/api/pulse/posts/{post.pk}/").json()
    assert detail["cover"] == f"/api/pulse/media/{with_small.pk}/" and detail["thumb"].endswith("/sm/")
    small = b"".join(client.get(card["thumb"]).streaming_content)
    original = b"".join(client.get(detail["cover"]).streaming_content)
    assert len(small) < len(original)
    no_small = _cover(tmp_path, "nosmall1", _jpeg(300, 400))
    assert b"".join(client.get(f"/api/pulse/media/{no_small.pk}/sm/").streaming_content) == (tmp_path / "covers" / "nosmall1.jpg").read_bytes()
    IgMediaAsset.objects.filter(pk=no_small.pk).update(small_path="../../etc/passwd")
    assert b"".join(client.get(f"/api/pulse/media/{no_small.pk}/sm/").streaming_content) == (tmp_path / "covers" / "nosmall1.jpg").read_bytes()
    assert APIClient().get(f"/api/pulse/media/{with_small.pk}/sm/").status_code in (401, 403)
    assert _api("sales_agent").get(f"/api/pulse/media/{with_small.pk}/").status_code == 403
