from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from routing.services import geocoding, planner
from routing.services.http import UpstreamError


@pytest.fixture
def client():
    return APIClient()


def body(**overrides):
    data = {
        "origin": {"lat": 41.88, "lon": -87.63},
        "destination": {"lat": 39.74, "lon": -104.99},
        "departure": (timezone.now() + timedelta(hours=2)).isoformat(),
        "load_lb": 42000,
        "interval_mi": 25,
    }
    data.update(overrides)
    return data


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_plan_success_passes_validated_trip(client, monkeypatch):
    captured = {}

    def fake_plan(trip):
        captured["trip"] = trip
        return {"routes": []}

    monkeypatch.setattr(planner, "plan", fake_plan)
    resp = client.post("/api/plan", body(interval_mi=10), format="json")
    assert resp.status_code == 200
    trip = captured["trip"]
    assert trip.origin == (41.88, -87.63) and trip.interval_mi == 10 and trip.load_lb == 42000


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"departure": (timezone.now() - timedelta(days=1)).isoformat()}, "departure"),
        ({"departure": (timezone.now() + timedelta(days=9)).isoformat()}, "departure"),
        ({"interval_mi": 15}, "interval_mi"),
        ({"load_lb": -5}, "load_lb"),
        ({"destination": {"lat": 41.88, "lon": -87.63}}, "destination"),
        ({"origin": {"lat": 120, "lon": 0}}, "origin"),
    ],
)
def test_plan_validation_errors(client, overrides, field):
    resp = client.post("/api/plan", body(**overrides), format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid request."
    assert field in resp.json()["errors"]


def test_upstream_errors_map_to_status(client, monkeypatch):
    def boom(_trip):
        raise UpstreamError("No truck route found", status=422)

    monkeypatch.setattr(planner, "plan", boom)
    resp = client.post("/api/plan", body(), format="json")
    assert resp.status_code == 422
    assert resp.json() == {"detail": "No truck route found"}


def test_geocode_requires_query(client):
    assert client.get("/api/geocode", {"q": "a"}).status_code == 400


def test_geocode_returns_results(client, monkeypatch):
    seen = {}

    def fake_search(q, near):
        seen["near"] = near
        return [{"label": "Denver, CO", "lat": 39.7, "lon": -105}]

    monkeypatch.setattr(geocoding, "search", fake_search)
    resp = client.get("/api/geocode", {"q": "denver", "lat": 40.0, "lon": -104.0})
    assert seen["near"] == (40.0, -104.0)
    assert resp.status_code == 200
    assert resp.json()["results"][0]["label"] == "Denver, CO"
    assert "max-age" in resp["Cache-Control"]


def test_security_headers_present(client):
    resp = client.get("/api/health")
    assert resp["X-Content-Type-Options"] == "nosniff"
    assert resp["X-Frame-Options"] == "DENY"
    assert "default-src 'self'" in resp["Content-Security-Policy"]


def test_reverse_geocode(client, monkeypatch):
    monkeypatch.setattr(geocoding, "reverse", lambda lat, lon: "Gulberg, Lahore")
    resp = client.get("/api/reverse", {"lat": 31.52, "lon": 74.35})
    assert resp.status_code == 200
    assert resp.json() == {"label": "Gulberg, Lahore"}
    assert resp["Cache-Control"].startswith("private")


def test_reverse_geocode_validates_range(client):
    assert client.get("/api/reverse", {"lat": 120, "lon": 0}).status_code == 400
