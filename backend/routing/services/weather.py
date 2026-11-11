"""Open-Meteo hourly forecasts for many points at once.

* Points are fetched in batches (one HTTP call per 50 locations) and batches run concurrently.
* Each point's series is cached under (point, time window); windows are snapped to 6-hour
  boundaries so nearby departure times reuse the same entries.
* Sampling semantics: wind/gust/temperature are instantaneous values and are linearly
  interpolated; rain/snowfall are "preceding hour" totals, so the bucket that *contains* the
  truck's arrival time is used (the value stamped at the next full hour).
"""

import logging
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from math import ceil, floor

from django.conf import settings
from django.core.cache import cache

from .geo import Coord
from .http import UpstreamError, session, timeout

logger = logging.getLogger(__name__)

HOUR = 3600
WINDOW_SNAP_S = 6 * HOUR
BATCH_SIZE = 50
MAX_PARALLEL_BATCHES = 4
VARIABLES = ("wind_speed_10m", "wind_gusts_10m", "rain", "snowfall", "temperature_2m", "weather_code")

Values = tuple[float | None, ...]


@dataclass(slots=True, frozen=True)
class Sample:
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float
    snow_in_hr: float
    temp_f: float | None
    weather_code: int | None


@dataclass(slots=True, frozen=True)
class Series:
    t0: int  # unix seconds of the first hourly value
    wind: Values
    gust: Values
    rain: Values
    snow: Values
    temp: Values
    code: Values

    def _lerp(self, values: Values, i: int, frac: float) -> float | None:
        a = values[i]
        b = values[min(i + 1, len(values) - 1)]
        if a is None or b is None:
            return a if b is None else b
        return a + (b - a) * frac

    def sample(self, ts: float) -> Sample | None:
        x = (ts - self.t0) / HOUR
        n = len(self.wind)
        if x < 0 or x > n - 1:
            return None
        i, frac = floor(x), x - floor(x)
        bucket = min(ceil(x), n - 1)
        wind = self._lerp(self.wind, i, frac)
        rain, snow = self.rain[bucket], self.snow[bucket]
        if wind is None or rain is None or snow is None:
            return None
        code = self.code[bucket]
        return Sample(
            wind_mph=wind,
            gust_mph=self._lerp(self.gust, i, frac),
            rain_in_hr=rain,
            snow_in_hr=snow,
            temp_f=self._lerp(self.temp, i, frac),
            weather_code=int(code) if code is not None else None,
        )


def snap_window(start_ts: float, end_ts: float) -> tuple[int, int]:
    start = floor((start_ts - HOUR) / WINDOW_SNAP_S) * WINDOW_SNAP_S
    end = ceil((end_ts + HOUR) / WINDOW_SNAP_S) * WINDOW_SNAP_S
    return start, end


def _iso_hour(ts: int) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%dT%H:%M")


def _parse(item: dict) -> Series:
    h = item["hourly"]
    return Series(
        t0=int(h["time"][0]),
        wind=tuple(h["wind_speed_10m"]),
        gust=tuple(h["wind_gusts_10m"]),
        rain=tuple(h["rain"]),
        snow=tuple(h["snowfall"]),
        temp=tuple(h["temperature_2m"]),
        code=tuple(h["weather_code"]),
    )


def _fetch_batch(points: list[Coord], start: int, end: int) -> list[Series] | None:
    params = {
        "latitude": ",".join(f"{lat:.3f}" for lat, _ in points),
        "longitude": ",".join(f"{lon:.3f}" for _, lon in points),
        "hourly": ",".join(VARIABLES),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timeformat": "unixtime",
        "timezone": "GMT",
        "start_hour": _iso_hour(start),
        "end_hour": _iso_hour(end),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY
    try:
        resp = session().get(settings.OPEN_METEO_URL, params=params, timeout=timeout())
        resp.raise_for_status()
        payload = resp.json()
        items = payload if isinstance(payload, list) else [payload]
        if len(items) != len(points):
            raise ValueError(f"expected {len(points)} locations, got {len(items)}")
        return [_parse(item) for item in items]
    except Exception as exc:  # one failed batch must not sink the whole plan
        logger.warning("Open-Meteo batch of %d points failed: %s", len(points), exc)
        return None


def fetch_series(points: Iterable[Coord], start_ts: float, end_ts: float) -> dict[Coord, Series]:
    """Hourly series covering [start_ts, end_ts] for each point; failed points are omitted."""
    start, end = snap_window(start_ts, end_ts)
    keys = {pt: f"wx:v1:{pt[0]:.3f},{pt[1]:.3f}:{start}:{end}" for pt in dict.fromkeys(points)}
    found = cache.get_many(list(keys.values())) if keys else {}
    result = {pt: found[k] for pt, k in keys.items() if k in found}
    missing = [pt for pt in keys if pt not in result]
    if not missing:
        return result

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL_BATCHES, len(batches))) as pool:
        outcomes = list(pool.map(lambda b: _fetch_batch(b, start, end), batches))

    fresh: dict[str, Series] = {}
    for batch, series_list in zip(batches, outcomes, strict=True):
        if series_list is None:
            continue
        for pt, series in zip(batch, series_list, strict=True):
            result[pt] = series
            fresh[keys[pt]] = series
    if not fresh:
        raise UpstreamError("Weather service is busy or unavailable. Please retry in a minute.", status=503)
    cache.set_many(fresh, settings.WEATHER_CACHE_TTL_S)
    return result
