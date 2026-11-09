# راهنمای اولین استقرار پالس روی سرور

این راهنما برای صاحب سرور است. همه‌ی دستورها روی سرور، داخل پوشه‌ی `/opt/elinor-iq` اجرا می‌شوند، مگر جایی که نوشته «روی مک».
هر مرحله را جدا اجرا کنید و خروجی را با «خروجی درست» مقایسه کنید. اگر فرق داشت، ادامه ندهید و خروجی را برای مهندس بفرستید.

> هیچ‌وقت `cat .env` نزنید و محتوای `.env` را جایی نفرستید. برای بررسی فقط از `grep -c` استفاده کنید که عدد برمی‌گرداند.

---

## مرحله‌ی ۰. آماده‌سازی

```bash
cd /opt/elinor-iq
```

نسخه‌ی فعلی را یادداشت کنید (برای برگشت لازم است):

```bash
git rev-parse --short HEAD
```

خروجی درست: یک کد کوتاه، مثلاً `4d9c616`. آن را جایی بنویسید.

نام ایمیج بک‌اند را چک کنید:

```bash
docker images --format '{{.Repository}}' | grep -x elinor-iq-backend
```

خروجی درست: `elinor-iq-backend`.
اگر خروجی خالی بود: **ادامه ندهید** و به مهندس خبر بدهید. نسخه‌ی جدید روی همین نام حساب کرده است.

---

## مرحله‌ی ۱. پشتیبان دیتابیس

```bash
mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/elinor_iq-before-pulse-$(date +%F).dump
ls -lh backups/*.dump
```

خروجی درست: یک فایل با حجم چند ده یا چند صد مگابایت.
اگر حجم صفر یا چند کیلوبایت بود: **ادامه ندهید**.

سالم بودن فایل را چک کنید:

```bash
docker compose exec -T postgres pg_restore -l < backups/elinor_iq-before-pulse-$(date +%F).dump | head -3
```

خروجی درست: خطی شبیه `; Archive created at ...`.

---

## مرحله‌ی ۲. به‌روزرسانی با پالس خاموش

مطمئن شوید پالس هنوز روشن نشده است:

```bash
grep -c '^PULSE_ENABLED=true' .env
```

خروجی درست: `0`. اگر `1` بود، آن خط را با nano پاک کنید.

به‌روزرسانی:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/production/update.sh)"
```

خروجی درست: در پایان «آپدیت تمام شد.».
ساخت ایمیج چند دقیقه طول می‌کشد. یک بسته‌ی جدید (Pillow، برای کوچک کردن عکس‌ها) دانلود می‌شود.

**اگر ساخت بیش از ۲۰ دقیقه بی‌حرکت ماند:** Ctrl+C بزنید و این را اجرا کنید:

```bash
docker compose up -d --force-recreate --no-build --pull never
docker compose restart nginx
```

با این کار برنامه با ایمیج قبلی بالا می‌آید و کار می‌کند. فقط ساخت نسخه‌ی کوچک کاورها انجام نمی‌شود و کاور اصلی نمایش داده می‌شود. به مهندس خبر بدهید.

چک کنید همه‌ی سرویس‌ها بالا هستند:

```bash
docker compose ps --format '{{.Service}} {{.Status}}'
```

خروجی درست: `backend`، `frontend`، `nginx`، `postgres`، `scheduler` و `pulse-scheduler` همه `Up` باشند.

چک کنید جدول‌های جدید ساخته شده‌اند:

```bash
docker compose exec backend python manage.py showmigrations pulse accounts | grep -E "0004|pulse"
```

خروجی درست: جلوی `0004_content_role` و همه‌ی migrationهای `pulse` (تا `0004_phase22_small_covers`) علامت `[X]` باشد.

چک کنید پالس بیکار است:

```bash
docker compose logs --tail=3 pulse-scheduler
```

خروجی درست: خط «Pulse is disabled (PULSE_ENABLED=false).».

---

## مرحله‌ی ۳. بررسی برنامه‌ی فعلی

در مرورگر وارد شوید. داشبورد، فروش و مشتریان باید مثل قبل باز شوند.

چک کنید پالس از بیرون پیدا نیست:

```bash
docker compose exec -T backend python -c "import urllib.request as u
try:
    u.urlopen('http://127.0.0.1:8000/api/pulse/status/')
except Exception as e:
    print(e)"
```

خروجی درست: `HTTP Error 404: Not Found`.

اگر صفحه‌ای از برنامه خراب بود: به «برگشت کامل» در انتهای همین سند بروید.

---

## مرحله‌ی ۴. روشن کردن پالس

```bash
nano .env
```

این ۵ خط را در انتهای فایل اضافه کنید. کلیدها را خودتان دارید؛ آن‌ها را برای کسی نفرستید.

```
PULSE_ENABLED=true
ZERNIO_API_KEY=کلید Zernio
ZERNIO_ACCOUNT_ID=6aedbbd9ea60f545dbaab9e9
PULSE_COVER_RELAY_URL=https://elinor-cover.yuzservicegroup.workers.dev
PULSE_COVER_RELAY_TOKEN=توکن واسطه
```

ذخیره: Ctrl+O، Enter، Ctrl+X.

بررسی (بدون نمایش مقدارها):

```bash
grep -cE '^(PULSE_ENABLED=true|ZERNIO_API_KEY=.+|ZERNIO_ACCOUNT_ID=.+|PULSE_COVER_RELAY_URL=.+|PULSE_COVER_RELAY_TOKEN=.+)$' .env
```

خروجی درست: `5`.

```bash
docker compose up -d --force-recreate backend pulse-scheduler
```

خروجی درست: دو خط `Started`.

---

## مرحله‌ی ۵. اولین همگام‌سازی

> این دستورها در `pulse-scheduler` اجرا می‌شوند، نه `backend`. بک‌اند فقط اجازه‌ی خواندن عکس‌ها را دارد.

```bash
docker compose exec pulse-scheduler python manage.py pulse_sync --full
```

حدود ۲۰ دقیقه طول می‌کشد، چون کاور هر پست جدا از طریق واسطه دانلود می‌شود (هر کاور حدود ۵ ثانیه).

خروجی درست، شبیه (عددهای ۹ نوامبر روی مک):

```
sync: {'days': 90, 'posts': 301, 'created': 301, ..., 'covers_ok': 200, 'covers_failed': 0, ...}
```

تعداد پست‌ها حدود ۳۰۰ یا بیشتر است. Zernio حالا پست‌های ۹۰ روز اخیر را دارد و هر روز پست تازه اضافه می‌شود.
هر اجرا حداکثر ۲۰۰ کاور می‌گیرد. بقیه را با این دستور بگیرید:

```bash
docker compose exec pulse-scheduler python manage.py pulse_fetch_covers
```

خروجی درست: `fetch_covers: {'covers_ok': ..., 'covers_failed': 0, ...}`.

اگر خروجی «sync: already running» بود، حلقه‌ی خودکار همین کار را شروع کرده است. ۱۰ دقیقه صبر کنید و ادامه دهید.

اگر `covers_failed` بالا بود، مشکلی نیست: مرحله‌ی ۶ کاورها را از روی مک می‌آورد.

---

## مرحله‌ی ۶. آوردن کاورهای ذخیره‌شده از مک

**روی مک** (به‌جای `SERVER` آدرس سرور را بگذارید):

```bash
scp /Users/rezasoltani/Documents/elinor-iq-v2/backups/pulse-covers-2026-11-09.tar.gz root@SERVER:/opt/elinor-iq/backups/
```

حجم فایل حدود ۱۳۵ مگابایت است (۳۰۸ کاور). اگر کاورهای مرحله‌ی ۵ کامل گرفته شده باشند، این مرحله فقط پشتیبان است و ضرری ندارد.

**روی سرور:**

```bash
docker compose cp backups/pulse-covers-2026-11-09.tar.gz pulse-scheduler:/tmp/pulse-covers.tar.gz
docker compose exec pulse-scheduler python manage.py pulse_import_covers /tmp/pulse-covers.tar.gz
```

خروجی درست، شبیه:

```
import_covers: {'imported': ..., 'kept': ..., 'unknown': ..., 'small': ...}
```

`imported + kept` باید حدود ۳۰۸ باشد. کاوری که در مرحله‌ی ۵ دانلود شده، `kept` حساب می‌شود و دست نمی‌خورد.
`unknown` یعنی پستی که روی سرور نیست (مثلاً پستی که از اینستاگرام پاک شده). چند عدد آن عادی است.

```bash
docker compose exec pulse-scheduler python manage.py pulse_make_small_covers
```

خروجی درست: `small_covers: {'created': ..., 'had': ..., 'failed': 0}`.
اگر `failed` برابر تعداد کاورها بود، Pillow نصب نشده است (مرحله‌ی ۲). مشکلی پیش نمی‌آید و کاور اصلی نمایش داده می‌شود. به مهندس خبر بدهید.

---

## مرحله‌ی ۷. محصولات و خلاصه‌ی امروز

```bash
docker compose exec pulse-scheduler python manage.py pulse_match_products
docker compose exec pulse-scheduler python manage.py pulse_daily_brief
```

خروجی درست:

- `match_products: {... 'matched': ...}`، با حدود ۲۵۰ کد تطبیق‌خورده.
- `daily_brief: {'date': '...', 'created': True, ...}`.

در مرورگر به `/pulse` بروید. باید خلاصه، کارها و کاورها دیده شوند.

---

## مرحله‌ی ۸. ساختن حساب تیم محتوا

برای هر نفر یک حساب جدا بسازید، نه یک حساب مشترک:

```bash
docker compose exec backend python manage.py create_user --username sara
```

دو بار رمز را می‌پرسد. موقع تایپ چیزی نمایش داده نمی‌شود و این عادی است. رمز حداقل ۸ حرف باشد.

خروجی درست: `User 'sara' created with role 'content'.`

راه دیگر: در `/admin/` بخش Users گزینه‌ی «Add user» را بزنید، نقش (Role) را `Content` بگذارید و رمز را دو بار وارد کنید.

بررسی: با همین حساب روی گوشی وارد شوید. فقط «پالس» باید دیده شود، نه فروش و مشتریان.

---

## خاموش کردن پالس (اگر مشکلی دیدید)

```bash
nano .env
```

خط `PULSE_ENABLED=true` را به `PULSE_ENABLED=false` تغییر دهید و ذخیره کنید.

```bash
docker compose up -d --force-recreate backend pulse-scheduler
```

پالس کاملاً پنهان می‌شود: منو نمایش داده نمی‌شود، آدرس‌ها ۴۰۴ می‌دهند و کارهای خودکار انجام نمی‌شوند. جدول‌های `ig_` و داده‌ها می‌مانند.
**هیچ جدولی را پاک نکنید.** با برگرداندن به `true` همه‌چیز سر جایش برمی‌گردد.

---

## برگشت کامل (فقط اگر بعد از مرحله‌ی ۲ برنامه‌ی فعلی خراب بود)

۱. نسخه‌ی کد را به همان کدی برگردانید که در مرحله‌ی ۰ نوشتید:

```bash
git reset --hard کد-مرحله-۰
docker compose up -d --build --force-recreate
docker compose restart nginx
```

۲. دیتابیس را فقط اگر مهندس گفت برگردانید. migrationهای این نسخه فقط جدول اضافه می‌کنند و چیزی را پاک نمی‌کنند:

```bash
cp backups/elinor_iq-before-pulse-تاریخ.dump backups/elinor_iq.dump
bash -c "$(curl -fsSL https://raw.githubusercontent.com/yuzservice/elinor-iq/main/restore-database.sh)"
```
