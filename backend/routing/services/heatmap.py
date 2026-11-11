"""Weather heatmap over the trip corridor.

The corridor is the set of cells of a global lat/lon lattice whose centres lie within a buffer of
any candidate route. The lattice step is the finest one that keeps the cell count under
HEATMAP_MAX_CELLS; snapping to a *global* lattice means cells (and their cached forecasts) are
shared between different trips.
"""

from collections.abc import Sequence
from math import ceil, cos, radians

from .geo import Coord, haversine_mi
from .risk import level_of
from .routing import Route
from .weather import Series

HOURS = 48
MI_PER_DEG_LAT = 69.17
GRID_STEPS_DEG = (0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0, 1.5, 2.0)


def corridor_buffer_mi(routes: Sequence[Route]) -> float:
    longest = max(r.distance_mi for r in routes)
    return min(60.0, max(15.0, longest * 0.06))


def corridor_cells(routes: Sequence[Route], max_cells: int) -> tuple[list[Coord], float]:
    buffer = corridor_buffer_mi(routes)
    lats = [lat for r in routes for lat, _ in r.coords]
    cos_mid = max(0.2, cos(radians((min(lats) + max(lats)) / 2)))
    union_len = sum(r.distance_mi for r in routes) * 0.6 + max(r.distance_mi for r in routes) * 0.4
    area = union_len * 2 * buffer + 3.1416 * buffer * buffer

    def estimate(step: float) -> float:
        return area / ((step * MI_PER_DEG_LAT) ** 2 * cos_mid)

    # Start at the finest step whose area estimate fits, then coarsen until the real count fits.
    first = next((i for i, s in enumerate(GRID_STEPS_DEG) if estimate(s) <= max_cells * 1.1), -1)
    for step in GRID_STEPS_DEG[first:]:
        cells = _cells_for_step(routes, buffer, step)
        if len(cells) <= max_cells:
            break
    return [(round(i * step, 4), round(j * step, 4)) for i, j in sorted(cells)], step


def _cells_for_step(routes: Sequence[Route], buffer: float, step: float) -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    sample_every = max(1.0, step * MI_PER_DEG_LAT * 0.5)
    r_lat = ceil(buffer / (MI_PER_DEG_LAT * step))
    for route in routes:
        mile = 0.0
        while True:
            (lat, lon), _ = route.locate(min(mile, route.distance_mi))
            i0, j0 = round(lat / step), round(lon / step)
            r_lon = ceil(buffer / (MI_PER_DEG_LAT * max(0.2, cos(radians(lat))) * step))
            for i in range(i0 - r_lat, i0 + r_lat + 1):
                for j in range(j0 - r_lon, j0 + r_lon + 1):
                    if (i, j) not in cells and haversine_mi(lat, lon, i * step, j * step) <= buffer:
                        cells.add((i, j))
            if mile >= route.distance_mi:
                break
            mile += sample_every
    return cells


def build(
    cells: Sequence[Coord], step: float, series: dict[Coord, Series], departure_ts: float, load_lb: float
) -> dict:
    """Per-cell hourly arrays for hours 0..48 after departure (None where no forecast)."""
    times = [departure_ts + h * 3600 for h in range(HOURS + 1)]
    risk, wind, rain, snow = [], [], [], []
    for cell in cells:
        s = series.get(cell)
        r_row, w_row, p_row, s_row = [], [], [], []
        for ts in times:
            sample = s.sample(ts) if s else None
            if sample is None:
                r_row.append(None)
                w_row.append(None)
                p_row.append(None)
                s_row.append(None)
                continue
            r_row.append(int(level_of(sample.wind_mph, sample.rain_in_hr, sample.snow_in_hr, load_lb)))
            w_row.append(round(sample.wind_mph))
            p_row.append(round(sample.rain_in_hr * 100))  # hundredths of an inch per hour
            s_row.append(round(sample.snow_in_hr * 100))
        risk.append(r_row)
        wind.append(w_row)
        rain.append(p_row)
        snow.append(s_row)
    return {
        "start": int(departure_ts),
        "step_s": 3600,
        "hours": HOURS,
        "cell_deg": step,
        "cells": [[lon, lat] for lat, lon in cells],
        "risk": risk,
        "wind": wind,
        "rain": rain,
        "snow": snow,
    }
