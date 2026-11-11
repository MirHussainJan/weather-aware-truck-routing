import pytest
import responses
from django.conf import settings

from routing.services import weather
from routing.services.http import UpstreamError

T0 = 1_800_000_000 - (1_800_000_000 % 3600)


def series(**overrides):
    base = {
        "t0": T0,
        "wind": (10.0, 20.0, 30.0),
        "gust": (15.0, 25.0, 35.0),
        "rain": (0.0, 0.2, 0.6),
        "snow": (0.0, 0.0, 0.0),
        "temp": (30.0, 32.0, 34.0),
        "code": (0, 61, 63),
    }
    base.update(overrides)
    return weather.Series(**base)


def test_wind_is_interpolated_precip_uses_containing_hour():
    s = series().sample(T0 + 1800)  # 30 min after first hour
    assert s.wind_mph == pytest.approx(15.0)
    assert s.rain_in_hr == 0.2  # hour (T0, T0+1h] is stamped T0+1h
    assert s.weather_code == 61


def test_exact_hour_uses_that_hours_bucket():
    s = series().sample(T0 + 3600)
    assert s.wind_mph == 20.0
    assert s.rain_in_hr == 0.2


def test_outside_window_returns_none():
    assert series().sample(T0 - 1) is None
    assert series().sample(T0 + 3 * 3600) is None


def test_missing_values_return_none():
    assert series(rain=(None, None, None)).sample(T0 + 10) is None


def test_snap_window_is_six_hour_aligned():
    start, end = weather.snap_window(T0 + 100, T0 + 7200)
    assert start % (6 * 3600) == 0 and end % (6 * 3600) == 0
    assert start <= T0 + 100 - 3600 and end >= T0 + 7200 + 3600


def _payload(n):
    hourly = {
        "time": [T0, T0 + 3600],
        "wind_speed_10m": [5, 6],
        "wind_gusts_10m": [8, 9],
        "rain": [0, 0],
        "snowfall": [0, 0],
        "temperature_2m": [40, 41],
        "weather_code": [0, 0],
    }
    return [{"hourly": hourly} for _ in range(n)]


@responses.activate
def test_fetch_series_batches_and_caches():
    responses.get(settings.OPEN_METEO_URL, json=_payload(2))
    points = [(40.0, -100.0), (41.0, -101.0), (40.0, -100.0)]  # duplicate is fetched once
    first = weather.fetch_series(points, T0, T0 + 3600)
    assert set(first) == {(40.0, -100.0), (41.0, -101.0)}
    assert len(responses.calls) == 1

    second = weather.fetch_series(points, T0, T0 + 3600)
    assert second.keys() == first.keys()
    assert len(responses.calls) == 1  # served from cache


@responses.activate
def test_total_failure_raises_service_unavailable():
    responses.get(settings.OPEN_METEO_URL, status=500)
    with pytest.raises(UpstreamError) as err:
        weather.fetch_series([(40.0, -100.0)], T0, T0 + 3600)
    assert err.value.status == 503
