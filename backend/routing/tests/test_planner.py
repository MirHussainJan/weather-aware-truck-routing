import itertools
from datetime import UTC, datetime

import pytest

from routing.services import planner, weather
from routing.services.geo import decode_polyline
from routing.services.routing import build_route

DEPART = datetime(2026, 1, 1, 12, tzinfo=UTC)
T0 = int(DEPART.timestamp()) - 6 * 3600


def line(lat, n=60):
    return [(lat, -100.0 + i * 2 / (n - 1)) for i in range(n)]


def calm_or_windy(points, start, end):
    hours = int((end - start) // 3600) + 12
    out = {}
    for lat, lon in points:
        wind = 50.0 if lat < 40.5 else 5.0  # southern corridor is windy
        out[(lat, lon)] = weather.Series(
            t0=T0,
            wind=(wind,) * hours,
            gust=(wind + 10,) * hours,
            rain=(0.0,) * hours,
            snow=(0.0,) * hours,
            temp=(35.0,) * hours,
            code=(0,) * hours,
        )
    return out


@pytest.fixture
def stub_services(monkeypatch):
    fast_windy = build_route((line(40.0), [60.0] * 59), "test")
    slow_calm = build_route((line(41.0), [90.0] * 59), "test")
    monkeypatch.setattr(planner, "get_routes", lambda *a: [fast_windy, slow_calm])
    monkeypatch.setattr(planner.weather, "fetch_series", calm_or_windy)


def test_checkpoint_miles_includes_origin_and_destination():
    assert planner.checkpoint_miles(60, 25) == [0, 25, 50, 60]
    assert planner.checkpoint_miles(50.3, 25) == [0, 25, 50.3]  # tiny tail merged
    assert planner.checkpoint_miles(10, 25) == [0, 10]


def test_spans_cover_entire_route():
    miles = planner.checkpoint_miles(103.7, 10)
    edges = [0.0, *planner.span_boundaries(miles), 103.7]
    assert sum(b - a for a, b in itertools.pairwise(edges)) == pytest.approx(103.7)


def test_geometry_breaks_are_exact_vertices():
    route = build_route((line(40.0), [60.0] * 59), "test")
    breaks = [10.0, 50.0, 90.0]
    coords, idx = planner.geometry_with_breaks(route, breaks)
    for mile, i in zip(breaks, idx, strict=True):
        assert coords[i] == pytest.approx(route.locate(mile)[0])
    assert idx == sorted(idx)


def test_plan_recommends_calm_route_over_faster_windy_one(stub_services):
    trip = planner.TripRequest((40.0, -100.0), (40.0, -98.0), DEPART, 42_000, 25)
    result = planner.plan(trip)

    a, b = result["routes"]
    assert result["recommendation"]["route_id"] == "B"
    assert b["recommended"] and not a["recommended"]
    # 50 mph with >30,000 lb load -> No Travel on every checkpoint of route A.
    assert {cp["level"] for cp in a["checkpoints"]} == {4}
    assert a["stats"]["no_travel_mi"] == pytest.approx(a["distance_mi"], abs=0.2)
    assert b["stats"]["max_level"] == 0
    assert "No-Travel" in result["recommendation"]["comparisons"][0]

    # ETAs grow along the route and spans tile the geometry.
    etas = [cp["eta"] for cp in b["checkpoints"]]
    assert etas == sorted(etas) and etas[0] == int(DEPART.timestamp())
    n_coords = len(decode_polyline(b["geometry"], 5))
    segs = [cp["seg"] for cp in b["checkpoints"]]
    assert segs[0][0] == 0 and segs[-1][1] == n_coords - 1
    assert all(s1[1] == s2[0] for s1, s2 in itertools.pairwise(segs))


def test_plan_heatmap_shape(stub_services):
    trip = planner.TripRequest((40.0, -100.0), (40.0, -98.0), DEPART, 10_000, 50)
    hm = planner.plan(trip)["heatmap"]
    assert hm["hours"] == 48
    assert len(hm["cells"]) == len(hm["risk"]) == len(hm["wind"]) > 0
    assert all(len(row) == 49 for row in hm["risk"])
    # 50 mph with a 10,000 lb load is Severe (load rule does not apply).
    assert max(v for row in hm["risk"] for v in row if v is not None) == 3
