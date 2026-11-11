from functools import cache

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.http import require_GET
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.serializers import GeocodeQuerySerializer, PlanSerializer, ReverseQuerySerializer
from routing.services import geocoding, planner


class PlanView(APIView):
    throttle_scope = "plan"

    def post(self, request):
        serializer = PlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(planner.plan(serializer.to_trip()))


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        serializer = GeocodeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        response = Response({"results": geocoding.search(serializer.validated_data["q"], serializer.near())})
        response["Cache-Control"] = "public, max-age=86400"
        return response


class ReverseGeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        serializer = ReverseQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        response = Response({"label": geocoding.reverse(v["lat"], v["lon"])})
        response["Cache-Control"] = "private, max-age=3600"  # it's the user's location: never shared caches
        return response


class HealthView(APIView):
    throttle_classes = []

    def get(self, request):
        return Response({"status": "ok"})


@cache
def _index_html() -> bytes | None:
    index = settings.FRONTEND_DIST / "index.html"
    return index.read_bytes() if index.is_file() else None


@require_GET
def spa_index(request):
    if settings.DEBUG:
        _index_html.cache_clear()  # pick up frontend rebuilds without a restart
    html = _index_html()
    if html is None:
        return HttpResponseNotFound("Frontend build not found. Run `npm run build` in /frontend.")
    response = HttpResponse(html, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"  # always revalidate; hashed assets are immutable
    return response
