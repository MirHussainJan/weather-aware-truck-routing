"""Django settings. All deploy-specific values come from environment variables."""

import os
import re
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY") or ("dev-insecure-key" if DEBUG else None)
if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1" if DEBUG else "")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
if render_host := env("RENDER_EXTERNAL_HOSTNAME"):  # set automatically by Render
    ALLOWED_HOSTS.append(render_host)
    CSRF_TRUSTED_ORIGINS.append(f"https://{render_host}")
if space_host := env("SPACE_HOST"):  # set automatically by Hugging Face Spaces
    ALLOWED_HOSTS.append(space_host)
    CSRF_TRUSTED_ORIGINS.append(f"https://{space_host}")
# On a Hugging Face Space the app is also shown inside huggingface.co's Space page (an iframe).
ON_HF_SPACE = bool(env("SPACE_ID"))

INSTALLED_APPS = [
    "rest_framework",
    "routing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
]
if ON_HF_SPACE:  # framing is governed by CSP frame-ancestors below instead
    MIDDLEWARE.remove("django.middleware.clickjacking.XFrameOptionsMiddleware")

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Stateless service: no database is required.
DATABASES: dict = {}

TEMPLATES: list = []
USE_TZ = True
TIME_ZONE = "UTC"
USE_I18N = False

# --- Static files / SPA ----------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = None  # no Django-managed static files; WhiteNoise serves the SPA build
FRONTEND_DIST = Path(env("FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.is_dir() else None
_HASHED_ASSET = re.compile(r"^.+[.-][0-9A-Za-z_-]{8,}\.(?:m?js|css|woff2?|svg|png|webp)$")


def WHITENOISE_IMMUTABLE_FILE_TEST(path: str, url: str) -> bool:  # noqa: N802 (Django setting name)
    """Vite emits content-hashed asset names; those can be cached forever."""
    return url.startswith("/assets/") and bool(_HASHED_ASSET.match(url))


# --- Cache -------------------------------------------------------------------
REDIS_URL = env("REDIS_URL")
CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "KEY_PREFIX": "wtr",
            "TIMEOUT": 1800,
            "OPTIONS": {"socket_timeout": 2, "socket_connect_timeout": 2},
        }
        if REDIS_URL
        else {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "wtr",
            "TIMEOUT": 1800,
            "OPTIONS": {"MAX_ENTRIES": 20_000},
        }
    )
}

# --- DRF -------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "plan": env("THROTTLE_PLAN", "20/min"),
        "geocode": env("THROTTLE_GEOCODE", "90/min"),
    },
    "NUM_PROXIES": int(env("NUM_PROXIES", "1" if not DEBUG else "0")),
    "EXCEPTION_HANDLER": "routing.exceptions.exception_handler",
    "COMPACT_JSON": True,
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 16_384  # request bodies are tiny JSON objects

# --- Security headers --------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SECURE_REDIRECT_EXEMPT = [r"^api/health$"]
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True

SILENCED_SYSTEM_CHECKS = [
    "security.W003",  # no cookies, sessions or auth: the stateless JSON API has nothing for CSRF to protect
    "security.W021",  # HSTS preload is an irreversible, per-domain decision left to the operator
]

MAP_TILE_ORIGIN = "https://tiles.openfreemap.org"
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF],
    # Runtime <style> tags from UI libraries are allowed by exact hash (no 'unsafe-inline'):
    # Radix ScrollArea's scrollbar reset and NumberFlow's shadow-DOM stylesheet (Skiper UI number).
    # If a library upgrade changes them, the browser console prints the new hash to put here.
    "style-src": [
        CSP.SELF,
        "'sha256-vGQdhYJbTuF+M8iCn1IZCHpdkiICocWHDq4qnQF4Rjw='",
        "'sha256-HR6/MuuYfB8aijiNP5MPm3YOR8WqVmL7UkE3Q8OslTs='",
    ],
    "img-src": [CSP.SELF, "data:", "blob:", MAP_TILE_ORIGIN],
    "font-src": [CSP.SELF],
    "connect-src": [CSP.SELF, MAP_TILE_ORIGIN],
    "worker-src": [CSP.SELF, "blob:"],
    "child-src": ["blob:"],
    "object-src": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "frame-ancestors": ["https://huggingface.co"] if ON_HF_SPACE else [CSP.NONE],
    "form-action": [CSP.SELF],
}

# --- External services ----------------------------------------------------------------
HTTP_USER_AGENT = env("HTTP_USER_AGENT", "WeatherAwareTruckRouting/1.0")
HTTP_TIMEOUT_S = float(env("HTTP_TIMEOUT_S", "20"))
VALHALLA_URL = env("VALHALLA_URL", "https://valhalla1.openstreetmap.de").rstrip("/")
OSRM_URL = env("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
OPEN_METEO_URL = env("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")
OPEN_METEO_API_KEY = env("OPEN_METEO_API_KEY")
PHOTON_URL = env("PHOTON_URL", "https://photon.komoot.io/api/")

# --- Domain tuning -----------------------------------------------------------------------
TRUCK_TARE_LB = int(env("TRUCK_TARE_LB", "35000"))  # tractor + empty trailer, added for routing
TRUCK_MAX_MPH = float(env("TRUCK_MAX_MPH", "65"))  # typical fleet speed governor
VALHALLA_MAX_MI = float(env("VALHALLA_MAX_MI", "900"))  # public server limit is 1,500 km crow-fly
HEATMAP_MAX_CELLS = int(env("HEATMAP_MAX_CELLS", "250"))
ROUTE_CACHE_TTL_S = int(env("ROUTE_CACHE_TTL_S", str(6 * 3600)))
WEATHER_CACHE_TTL_S = int(env("WEATHER_CACHE_TTL_S", "1800"))
GEOCODE_CACHE_TTL_S = int(env("GEOCODE_CACHE_TTL_S", str(7 * 86400)))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {"urllib3": {"level": "WARNING"}},
}
