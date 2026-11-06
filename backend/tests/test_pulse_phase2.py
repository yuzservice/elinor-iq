import importlib
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
def test_rule_repeat_winner():
    _baseline()
    yesterday_noon = NOW - timedelta(days=1)
    _post(at=yesterday_noon, views=1400)
    assert brief.rule_repeat_winner(analytics.load(NOW)) is None  # 1.4x
    _post(at=yesterday_noon + timedelta(hours=1), views=2000, skip=39, caption="ریل قسطی اسنپ‌پی")
    title, reason = brief.rule_repeat_winner(analytics.load(NOW))
    assert "ریل قسطی اسنپ‌پی" in title and "۲ برابر" in reason and "۳۹٪" in reason


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
    _post(at=NOW - timedelta(days=1), views=5000, skip=40)  # repeat_winner
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
        assert "—" not in text and not _LATIN_DIGIT.search(text), text
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
