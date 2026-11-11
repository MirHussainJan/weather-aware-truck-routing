import pytest

from routing.services.risk import (
    Level,
    assess,
    level_of,
    loaded_wind_level,
    rain_level,
    snow_level,
    wind_level,
)

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


@pytest.mark.parametrize(
    ("mph", "expected"),
    [(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, N), (80, N)],
)
def test_wind_thresholds(mph, expected):
    assert wind_level(mph) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [(0, L), (0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S), (1.01, N)],
)
def test_rain_thresholds(inches, expected):
    assert rain_level(inches) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, N)],
)
def test_snow_thresholds(inches, expected):
    assert snow_level(inches) == expected


@pytest.mark.parametrize(
    ("mph", "load", "expected"),
    [
        (55, 0, N),  # >=55 mph: No Travel for any load
        (50, 30_000, S),  # 45-54 mph at exactly 30,000 lb is not "> 30,000"
        (50, 30_001, N),  # 45-54 mph + >30,000 lb -> No Travel
        (40, 40_000, H),
        (40, 40_001, S),  # 35-44 mph + >40,000 lb -> Severe
        (40, 35_000, H),
        (30, 80_000, M),  # load rules don't touch moderate wind
    ],
)
def test_load_rules(mph, load, expected):
    assert loaded_wind_level(mph, load) == expected


def test_overall_level_is_worst_factor():
    assert level_of(10, 0.3, 0.0, 0) == H
    assert level_of(40, 0.0, 2.5, 45_000) == S
    assert level_of(50, 0.0, 0.0, 35_000) == N


def test_assess_explains_load_escalation():
    a = assess(40, 0.0, 0.0, 45_000)
    assert a.level == S
    assert a.wind == S and a.rain == L and a.snow == L
    assert "raised from High" in a.drivers[0]


def test_assess_low_has_no_drivers():
    assert assess(5, 0, 0, 10_000).drivers == ()
