"""Weather risk classification — a direct encoding of the specified risk and load rules.

Boundaries: each band includes its lower bound ("25–34 mph" means 25 <= wind < 35, so a 34.6 mph
reading is Moderate). The top "No Travel" bands for rain/snow are strict (> 1.00, > 3.00) as written,
so exactly 1.00 in/hr rain is Severe.
"""

from dataclasses import dataclass
from enum import IntEnum


class Level(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return _LABELS[self]


_LABELS = {
    Level.LOW: "Low",
    Level.MODERATE: "Moderate",
    Level.HIGH: "High",
    Level.SEVERE: "Severe",
    Level.NO_TRAVEL: "No Travel",
}

LOAD_NO_TRAVEL_LB = 30_000  # 45–54 mph wind with load above this -> No Travel
LOAD_SEVERE_LB = 40_000  # 35–44 mph wind with load above this -> Severe


def wind_level(mph: float) -> Level:
    if mph < 25:
        return Level.LOW
    if mph < 35:
        return Level.MODERATE
    if mph < 45:
        return Level.HIGH
    if mph < 55:
        return Level.SEVERE
    return Level.NO_TRAVEL


def rain_level(in_hr: float) -> Level:
    if in_hr < 0.10:
        return Level.LOW
    if in_hr < 0.25:
        return Level.MODERATE
    if in_hr < 0.50:
        return Level.HIGH
    if in_hr <= 1.00:
        return Level.SEVERE
    return Level.NO_TRAVEL


def snow_level(in_hr: float) -> Level:
    if in_hr < 0.5:
        return Level.LOW
    if in_hr < 1.0:
        return Level.MODERATE
    if in_hr < 2.0:
        return Level.HIGH
    if in_hr <= 3.0:
        return Level.SEVERE
    return Level.NO_TRAVEL


def loaded_wind_level(mph: float, load_lb: float) -> Level:
    """Wind level after applying the load rules (>=55 mph is already No Travel for any load)."""
    base = wind_level(mph)
    if base == Level.SEVERE and load_lb > LOAD_NO_TRAVEL_LB:
        return Level.NO_TRAVEL
    if base == Level.HIGH and load_lb > LOAD_SEVERE_LB:
        return Level.SEVERE
    return base


def level_of(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Level:
    """Fast path used for heatmap cells: overall level = worst of the three factors."""
    return max(loaded_wind_level(wind_mph, load_lb), rain_level(rain_in_hr), snow_level(snow_in_hr))


@dataclass(slots=True, frozen=True)
class Assessment:
    level: Level
    wind: Level
    rain: Level
    snow: Level
    drivers: tuple[str, ...]  # human-readable explanation of what set the level


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    raw_wind = wind_level(wind_mph)
    wind = loaded_wind_level(wind_mph, load_lb)
    rain = rain_level(rain_in_hr)
    snow = snow_level(snow_in_hr)
    level = max(wind, rain, snow)

    drivers: list[str] = []
    if level > Level.LOW:
        if wind == level:
            note = f"Wind {wind_mph:.0f} mph"
            if wind != raw_wind:
                note += f" with {load_lb:,.0f} lb load (raised from {raw_wind.label})"
            drivers.append(note)
        if rain == level:
            drivers.append(f"Rain {rain_in_hr:.2f} in/hr")
        if snow == level:
            drivers.append(f"Snow {snow_in_hr:.2f} in/hr")
    return Assessment(level, wind, rain, snow, tuple(drivers))
