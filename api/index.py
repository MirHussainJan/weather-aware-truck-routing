"""Vercel entry point: the Django API as a Python function (Vercel's CDN serves the built SPA)."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application

app = get_wsgi_application()
