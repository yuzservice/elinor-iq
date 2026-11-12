from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY is required.")

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() in {"1", "true", "yes"}

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CSRF_TRUSTED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
    ).split(",")
    if origin.strip()
]
for _host in ALLOWED_HOSTS:
    if _host in {"localhost", "127.0.0.1", "backend", "*"}:
        continue
    for _scheme in ("https", "http"):
        _origin = f"{_scheme}://{_host}"
        if _origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(_origin)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.accounts.apps.AccountsConfig",
    "apps.core.apps.CoreConfig",
    "apps.integrations.elinor.apps.ElinorConfig",
    "apps.customers.apps.CustomersConfig",
    "apps.sales.apps.SalesConfig",
    "apps.products.apps.ProductsConfig",
    "apps.system.apps.SystemConfig",
    "apps.calls.apps.CallsConfig",
    "apps.pulse.apps.PulseConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.SalesAgentScopeMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"

postgres_host = os.environ.get("POSTGRES_HOST")
postgres_db = os.environ.get("POSTGRES_DB")
postgres_user = os.environ.get("POSTGRES_USER")
postgres_password = os.environ.get("POSTGRES_PASSWORD")
postgres_port = os.environ.get("POSTGRES_PORT", "5432")

if not all([postgres_host, postgres_db, postgres_user, postgres_password]):
    raise RuntimeError("PostgreSQL is required. SQLite is not supported.")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": postgres_db,
        "USER": postgres_user,
        "PASSWORD": postgres_password,
        "HOST": postgres_host,
        "PORT": postgres_port,
        "CONN_MAX_AGE": 60,
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "fa-ir"
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
if os.environ.get("DJANGO_SECURE_COOKIES", "").lower() in {"1", "true", "yes"}:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
SESSION_COOKIE_AGE = 60 * 60 * 12

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
}

ELINOR_API_BASE_URL = os.environ.get("ELINOR_API_BASE_URL", "https://api.elinorboutique.com/v1")
ELINOR_API_USERNAME = os.environ.get("ELINOR_API_USERNAME", "")
ELINOR_API_PASSWORD = os.environ.get("ELINOR_API_PASSWORD", "")
ELINOR_RATE_LIMIT_PER_MINUTE = int(os.environ.get("ELINOR_RATE_LIMIT_PER_MINUTE", "45"))
ELINOR_SYNC_MAX_REQUESTS = int(os.environ.get("ELINOR_SYNC_MAX_REQUESTS", "900"))
ELINOR_SYNC_HOURLY_ONLINE_DETAILS_LIMIT = int(os.environ.get("ELINOR_SYNC_HOURLY_ONLINE_DETAILS_LIMIT", "250"))
ELINOR_SYNC_HOURLY_POS_DAYS = int(os.environ.get("ELINOR_SYNC_HOURLY_POS_DAYS", "3"))
ELINOR_SYNC_INTERVAL_SECONDS = int(os.environ.get("ELINOR_SYNC_INTERVAL_SECONDS", "3600"))

# Products intelligence thresholds (docs/business-rules/products.md). Percentile rules compare within one category.
PRODUCTS_RULES = {
    "driver_top_share": 0.10,  # «پیشران فروش»: top 10% full-price speed in its category...
    "driver_min_units": 10,  # ...and at least this many units in the last 28 days
    "growth_trend_pct": 20,  # «رو به رشد»: last 14 days vs previous 14
    "slow_bottom_share": 0.20,  # «کند»: bottom 20% speed in its category
    "stale_days": 30,  # «راکد»: no sale for this many days
    "min_category_size": 5,  # percentile rules need at least this many selling products in the category
    "lead_time_days": int(os.environ.get("PRODUCTS_LEAD_TIME_DAYS", "14")),  # «نیاز به شارژ فوری»
    "out_drop_pct": 70,  # «احتمالاً تمام شده»: last-7-day sales at least this much below the previous 4 weeks, central stock 0
    "bundle_min_baskets": 5,
    "bundle_early_baskets": 15,  # «سیگنال اولیه»: fewer baskets than this...
    "bundle_early_lift": 3,  # ...with lift at least this
    "bundle_fresh_trend_pct": 50,  # «فقط سیگنال‌های تازه»
}
# Internal (desk/staff) accounts place orders for real customers: ~34% of online item revenue locally. Sales totals keep
# them (apps/customers/operators.py); set true to drop them from product sales and bundles.
PRODUCTS_EXCLUDE_INTERNAL_SALES = os.environ.get("PRODUCTS_EXCLUDE_INTERNAL_SALES", "false").lower() in {"1", "true", "yes"}
# Owner decision 2026-11-11: no stock of any kind until the Elinor warehouse API exists. Off = no stock refresh (no API
# calls), no stock in responses or UI, no stock flags. Code, models and tables stay so it can be switched back on.
PRODUCTS_STOCK_ENABLED = os.environ.get("PRODUCTS_STOCK_ENABLED", "false").lower() in {"1", "true", "yes"}
PRODUCTS_STOCK_REFRESH_PER_RUN = int(os.environ.get("PRODUCTS_STOCK_REFRESH_PER_RUN", "150"))
# Home «نیاز به توجه»: tier drops count only from the top N enabled tiers of each channel (owner decision 2026-11-13).
HOME_TIER_DROP_TOP_N = int(os.environ.get("HOME_TIER_DROP_TOP_N", "3"))

# Elinor Pulse (Instagram). Off by default; architecture: docs/elinor-pulse-architecture.md
PULSE_ENABLED = os.environ.get("PULSE_ENABLED", "false").lower() in {"1", "true", "yes"}
PULSE_AI_ENABLED = os.environ.get("PULSE_AI_ENABLED", "false").lower() in {"1", "true", "yes"}
PULSE_HANDLE = os.environ.get("PULSE_HANDLE", "elinor_boutique")
PULSE_MEDIA_ROOT = os.environ.get("PULSE_MEDIA_ROOT", "/pulse-media")
# Cloudflare Worker that fetches Instagram CDN covers for the server (Instagram is filtered in Iran).
PULSE_COVER_RELAY_URL = os.environ.get("PULSE_COVER_RELAY_URL", "")
PULSE_COVER_RELAY_TOKEN = os.environ.get("PULSE_COVER_RELAY_TOKEN", "")
ZERNIO_API_KEY = os.environ.get("ZERNIO_API_KEY", "")
ZERNIO_ACCOUNT_ID = os.environ.get("ZERNIO_ACCOUNT_ID", "")
ZERNIO_API_BASE_URL = os.environ.get("ZERNIO_API_BASE_URL", "https://zernio.com/api")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "apps.integrations.elinor": {"level": "INFO", "handlers": ["console"], "propagate": False},
    },
}
