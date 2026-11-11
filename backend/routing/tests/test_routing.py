import pytest
import responses
from django.conf import settings

from routing.services import geo, routing
from routing.services.http import UpstreamError

ORIGIN, DEST = (40.0, -100.0), (40.0, -99.0)


def valhalla_trip(points, seconds):
    return {
        "legs": [
            {
                "shape": geo.encode_polyline(points, 6),
                "maneuvers": [
                    {"begin_shape_index": 0, "end_shape_index": len(points) - 1, "time": seconds},
                    {"begin_shape_index": len(points) - 1, "end_shape_index": len(points) - 1, "time": 0},
                ],
            }
        ]
    }


def straight(lat, n=20):
    return [(lat, -100.0 + i / (n - 1)) for i in range(n)]


@responses.activate
def test_valhalla_three_distinct_routes():
    responses.post(
        f"{settings.VALHALLA_URL}/route",
        json={
            "trip": valhalla_trip(straight(40.0), 3600),
            "alternates": [
                {"trip": valhalla_trip(straight(40.3), 4000)},
                {"trip": valhalla_trip(straight(39.7), 4200)},
            ],
        },
    )
    routes = routing.get_routes(ORIGIN, DEST, 30_000)
    assert [r.provider for r in routes] == ["valhalla"] * 3
    assert routes[0].duration_s == pytest.approx(3600)
    assert routes[0].distance_mi == pytest.approx(geo.haversine_mi(*ORIGIN, *DEST), rel=1e-3)
    # Cached: no second upstream call.
    routing.get_routes(ORIGIN, DEST, 30_000)
    assert len(responses.calls) == 1


@responses.activate
def test_speed_is_capped_at_truck_governor():
    responses.post(f"{settings.VALHALLA_URL}/route", json={"trip": valhalla_trip(straight(40.0), 60)})
    responses.post(f"{settings.VALHALLA_URL}/route", status=503)
    route = routing.get_routes(ORIGIN, DEST, 0)[0]
    assert route.duration_s == pytest.approx(route.distance_mi / settings.TRUCK_MAX_MPH * 3600, rel=1e-6)


@responses.activate
def test_no_path_is_a_client_error_without_fallback():
    responses.post(f"{settings.VALHALLA_URL}/route", status=400, json={"error_code": 442, "error": "No path"})
    with pytest.raises(UpstreamError) as err:
        routing.get_routes(ORIGIN, DEST, 0)
    assert err.value.status == 422


@responses.activate
def test_falls_back_to_osrm_when_valhalla_down():
    responses.post(f"{settings.VALHALLA_URL}/route", status=503)
    osrm_route = {
        "geometry": geo.encode_polyline(straight(40.0), 6),
        "legs": [{"annotation": {"duration": [200.0] * 19}}],
    }
    responses.get(
        f"{settings.OSRM_URL}/route/v1/driving/-100.000000,40.000000;-99.000000,40.000000",
        json={"code": "Ok", "routes": [osrm_route]},
    )
    routes = routing.get_routes(ORIGIN, DEST, 0)
    assert routes[0].provider == "osrm"
    assert routes[0].duration_s == pytest.approx(3800)


def test_join_legs_trims_out_and_back_spur():
    a = [(0.0, 0.0), (0.0, 1.0), (0.1, 1.0)]  # ends with a spur north to the via point
    b = [(0.1, 1.0), (0.0, 1.0), (0.0, 2.0)]  # comes straight back down
    coords, times, names = routing.join_legs((a, [1.0, 2.0], {"I 5": 1.0}), (b, [2.0, 1.0], {"I 5": 2.0}))
    assert coords == [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]
    assert times == [1.0, 1.0]
    assert names == {"I 5": 3.0}


def test_overlap_identical_and_disjoint():
    r1 = routing.build_route((straight(40.0), [10.0] * 19), "t")
    r2 = routing.build_route((straight(41.0), [10.0] * 19), "t")
    assert routing.overlap(r1, r1) == 1.0
    assert routing.overlap(r1, r2) == 0.0


def test_locate_interpolates_position_and_time():
    r = routing.build_route(([(40.0, -100.0), (40.0, -99.0)], [3600.0]), "t")
    (_lat, lon), elapsed = r.locate(r.distance_mi / 2)
    assert lon == pytest.approx(-99.5)
    assert elapsed == pytest.approx(1800)


def test_via_label_formats_dominant_highways():
    assert routing.via_label({"I 80": 435, "I 25 North": 98, "Main St": 1}) == "I-80 and I-25"
    assert routing.via_label({"I 65": 100, "I 65 South": 80, "US 41": 5}) == "I-65"
    assert routing.via_label({"US 6": 50, "Main St": 5}) == "US-6"
    assert routing.via_label({}) == ""
