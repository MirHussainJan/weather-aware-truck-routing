import pytest

from routing.services import geo


def test_haversine_known_distance():
    # Chicago -> Denver great-circle distance is ~920 mi
    assert geo.haversine_mi(41.8781, -87.6298, 39.7392, -104.9903) == pytest.approx(920, abs=3)


@pytest.mark.parametrize("precision", [5, 6])
def test_polyline_round_trip(precision):
    coords = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453), (-33.9, 151.2)]
    decoded = geo.decode_polyline(geo.encode_polyline(coords, precision), precision)
    for (a_lat, a_lon), (b_lat, b_lon) in zip(coords, decoded, strict=True):
        assert a_lat == pytest.approx(b_lat, abs=10**-precision)
        assert a_lon == pytest.approx(b_lon, abs=10**-precision)


def test_decode_reference_polyline():
    # Example from Google's polyline algorithm documentation.
    assert geo.decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5) == [
        (38.5, -120.2),
        (40.7, -120.95),
        (43.252, -126.453),
    ]


def test_simplify_drops_collinear_points_keeps_endpoints():
    line = [(40.0, -100.0 + i * 0.01) for i in range(101)]
    assert geo.simplify_indices(line, 0.01) == [0, 100]


def test_simplify_keeps_corner():
    pts = [(40.0, -100.0), (40.0, -99.5), (40.0, -99.0), (40.5, -99.0), (41.0, -99.0)]
    assert geo.simplify_indices(pts, 0.05) == [0, 2, 4]


def test_interp_index_bounds_and_middle():
    cum = [0.0, 10.0, 30.0]
    assert geo.interp_index(cum, -1) == (0, 0.0)
    assert geo.interp_index(cum, 40) == (1, 1.0)
    assert geo.interp_index(cum, 20) == (1, 0.5)


def test_destination_and_bearing_are_consistent():
    lat, lon = geo.destination(40.0, -100.0, 90, 50)
    assert geo.haversine_mi(40.0, -100.0, lat, lon) == pytest.approx(50, rel=1e-6)
    assert geo.bearing_deg(40.0, -100.0, lat, lon) == pytest.approx(90, abs=0.5)
