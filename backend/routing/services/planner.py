"""Trip planning pipeline: routes -> checkpoints with ETAs -> weather -> risk -> recommendation."""

import itertools
import logging
import time
from dataclasses import dataclass
from datetime import datetime

from django.conf import settings

from . import heatmap, recommend, weather
from .geo import Coord, encode_polyline
from .risk import assess
from .routing import Route, get_routes

logger = logging.getLogger(__name__)

ROUTE_IDS = "ABC"
CHECKPOINT_SNAP_DEG = 0.02  # ~2 km: finer than the forecast models' grid, improves cache reuse
MIN_TAIL_MI = 0.5


@dataclass(slots=True, frozen=True)
class TripRequest:
    origin: Coord
    destination: Coord
    departure: datetime
    load_lb: int
    interval_mi: int


def checkpoint_miles(total_mi: float, interval_mi: float) -> list[float]:
    """Origin, every `interval_mi`, and the destination (a sub-half-mile tail is merged into it)."""
    miles = [k * interval_mi for k in range(int(total_mi // interval_mi) + 1)]
    if total_mi - miles[-1] > MIN_TAIL_MI or len(miles) == 1:
        miles.append(total_mi)
    else:
        miles[-1] = total_mi
    return miles


def span_boundaries(miles: list[float]) -> list[float]:
    """Each checkpoint represents the stretch halfway to its neighbours."""
    return [(a + b) / 2 for a, b in itertools.pairwise(miles)]


def geometry_with_breaks(route: Route, breaks: list[float]) -> tuple[list[Coord], list[int]]:
    """Route vertices with exact vertices inserted at each break mile; returns their indices."""
    out: list[Coord] = []
    idx: list[int] = []
    j = 0
    for pt, cum in zip(route.coords, route.cum_mi, strict=True):
        while j < len(breaks) and breaks[j] < cum - 1e-6:
            idx.append(len(out))
            out.append(route.locate(breaks[j])[0])
            j += 1
        if j < len(breaks) and abs(breaks[j] - cum) <= 1e-6:
            idx.append(len(out))
            j += 1
        out.append(pt)
    idx.extend([len(out) - 1] * (len(breaks) - j))
    return out, idx


def _snap(pt: Coord) -> Coord:
    s = CHECKPOINT_SNAP_DEG
    return round(round(pt[0] / s) * s, 3), round(round(pt[1] / s) * s, 3)


def plan(req: TripRequest) -> dict:
    started = time.perf_counter()
    dep_ts = req.departure.timestamp()
    routes = get_routes(req.origin, req.destination, req.load_lb)

    # 1) Checkpoints along each route with the truck's ETA at each one.
    layouts = []
    for route in routes:
        miles = checkpoint_miles(route.distance_mi, req.interval_mi)
        located = [route.locate(m) for m in miles]
        layouts.append((miles, located))

    # 2) One weather fetch covering checkpoints and the heatmap corridor for the whole trip window.
    cells, cell_deg = heatmap.corridor_cells(routes, settings.HEATMAP_MAX_CELLS)
    window_end = dep_ts + max(heatmap.HOURS * 3600, max(r.duration_s for r in routes))
    points = [_snap(pt) for _, located in layouts for pt, _ in located] + cells
    series = weather.fetch_series(points, dep_ts, window_end)

    # 3) Risk per checkpoint, aggregated per route by the miles each checkpoint represents.
    route_payloads, stats = [], []
    for rid, route, (miles, located) in zip(ROUTE_IDS, routes, layouts, strict=False):
        bounds = span_boundaries(miles)
        coords, break_idx = geometry_with_breaks(route, bounds)
        edges_mi = [0.0, *bounds, route.distance_mi]
        edges_idx = [0, *break_idx, len(coords) - 1]
        st = recommend.RouteStats(route_id=rid, duration_s=route.duration_s)
        checkpoints = []
        for k, (mile, (pt, elapsed)) in enumerate(zip(miles, located, strict=True)):
            eta = dep_ts + elapsed
            s = series.get(_snap(pt))
            sample = s.sample(eta) if s else None
            span_mi = edges_mi[k + 1] - edges_mi[k]
            cp = {
                "mile": round(mile, 1),
                "lat": round(pt[0], 5),
                "lon": round(pt[1], 5),
                "eta": int(eta),
                "span_mi": round(span_mi, 2),
                "seg": [edges_idx[k], edges_idx[k + 1]],
                "level": None,
                "factors": None,
                "drivers": [],
                "weather": None,
            }
            if sample is None:
                st.add(None, span_mi)
            else:
                a = assess(sample.wind_mph, sample.rain_in_hr, sample.snow_in_hr, req.load_lb)
                st.add(a.level, span_mi)
                cp.update(
                    level=int(a.level),
                    factors={"wind": int(a.wind), "rain": int(a.rain), "snow": int(a.snow)},
                    drivers=list(a.drivers),
                    weather={
                        "wind_mph": round(sample.wind_mph, 1),
                        "gust_mph": None if sample.gust_mph is None else round(sample.gust_mph, 1),
                        "rain_in_hr": round(sample.rain_in_hr, 3),
                        "snow_in_hr": round(sample.snow_in_hr, 3),
                        "temp_f": None if sample.temp_f is None else round(sample.temp_f),
                        "code": sample.weather_code,
                    },
                )
            checkpoints.append(cp)
        stats.append(st)
        route_payloads.append(
            {
                "id": rid,
                "provider": route.provider,
                "via": route.via,
                "distance_mi": round(route.distance_mi, 1),
                "duration_s": round(route.duration_s),
                "arrival": int(dep_ts + route.duration_s),
                "geometry": encode_polyline(coords, 5),
                "checkpoints": checkpoints,
            }
        )

    # 4) Recommendation.
    ranked = recommend.rank(stats)
    best = ranked[0]
    by_id = {st.route_id: st for st in stats}
    for position, st in enumerate(ranked, start=1):
        payload = next(p for p in route_payloads if p["id"] == st.route_id)
        payload["rank"] = position
        payload["recommended"] = position == 1
        payload["stats"] = {
            "miles_by_level": [round(m, 1) for m in st.miles_by_level],
            "unknown_mi": round(st.unknown_mi, 1),
            "no_travel_mi": round(st.no_travel_mi, 1),
            "severe_mi": round(st.severe_mi, 1),
            "high_mi": round(st.high_mi, 1),
            "avg_risk": round(st.avg_risk, 3),
            "max_level": None if st.max_level is None else int(st.max_level),
        }

    warnings = []
    if len(routes) < len(ROUTE_IDS):
        warnings.append(f"Only {len(routes)} distinct truck route(s) exist between these locations.")
    if best.no_travel_mi > 0:
        warnings.append("Every route crosses No-Travel conditions. Consider delaying departure.")
    if any(st.unknown_mi > 0 for st in stats):
        warnings.append("No forecast was available for part of the trip; those miles are unrated.")

    logger.info(
        "plan routes=%d checkpoints=%d cells=%d took=%.2fs",
        len(routes),
        sum(len(p["checkpoints"]) for p in route_payloads),
        len(cells),
        time.perf_counter() - started,
    )
    return {
        "departure": int(dep_ts),
        "load_lb": req.load_lb,
        "interval_mi": req.interval_mi,
        "routes": route_payloads,
        "recommendation": {
            "route_id": best.route_id,
            "comparisons": [recommend.explain(best, by_id[st.route_id]) for st in ranked[1:]],
        },
        "warnings": warnings,
        "heatmap": heatmap.build(cells, cell_deg, series, dep_ts, req.load_lb),
    }
