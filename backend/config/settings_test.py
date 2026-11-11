"""Test settings: deterministic, isolated cache, no throttling surprises."""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret")
os.environ.setdefault("DJANGO_DEBUG", "1")

from .settings import *  # noqa: F403

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "test"}}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"plan": "1000/min", "geocode": "1000/min"}  # noqa: F405
