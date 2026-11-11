"""Vercel entry point: the Django API as a Python function (Vercel's CDN serves the built SPA).

vercel.json rewrites ``/api/<rest>`` to this function as ``?__path=<rest>``; the WSGI wrapper restores
the original ``/api/<rest>`` path (and the caller's own query string) before Django routes it.
"""

import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application

django_app = get_wsgi_application()


def app(environ, start_response):
    params = parse_qsl(environ.get("QUERY_STRING", ""), keep_blank_values=True)
    rest = next((v for k, v in params if k == "__path"), None)
    if rest is not None:
        environ["PATH_INFO"] = "/api/" + rest.lstrip("/")
        environ["QUERY_STRING"] = urlencode([(k, v) for k, v in params if k != "__path"])
    return django_app(environ, start_response)
