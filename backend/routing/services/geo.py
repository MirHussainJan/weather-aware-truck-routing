"""Small, dependency-free geodesy helpers. Coordinates are (lat, lon) tuples in degrees."""

import itertools
from bisect import bisect_left
from collections.abc import Sequence
from math import asin, atan2, cos, degrees, radians, sin, sqrt

EARTH_RADIUS_MI = 3958.7613
Coord = tuple[float, float]


def haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * asin(min(1.0, sqrt(a)))


def cumulative_miles(coords: Sequence[Coord]) -> list[float]:
    out = [0.0]
    total = 0.0
    for (a_lat, a_lon), (b_lat, b_lon) in itertools.pairwise(coords):
        total += haversine_mi(a_lat, a_lon, b_lat, b_lon)
        out.append(total)
    return out


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2, dl = radians(lat1), radians(lat2), radians(lon2 - lon1)
    y = sin(dl) * cos(p2)
    x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (degrees(atan2(y, x)) + 360) % 360


def destination(lat: float, lon: float, bearing: float, dist_mi: float) -> Coord:
    d = dist_mi / EARTH_RADIUS_MI
    b, p1, l1 = radians(bearing), radians(lat), radians(lon)
    p2 = asin(sin(p1) * cos(d) + cos(p1) * sin(d) * cos(b))
    l2 = l1 + atan2(sin(b) * sin(d) * cos(p1), cos(d) - sin(p1) * sin(p2))
    return degrees(p2), (degrees(l2) + 540) % 360 - 180


def interp_index(cum: Sequence[float], value: float) -> tuple[int, float]:
    """Return (i, t) such that value lies between cum[i] and cum[i+1] at fraction t."""
    if value <= cum[0]:
        return 0, 0.0
    if value >= cum[-1]:
        return len(cum) - 2, 1.0
    j = bisect_left(cum, value)
    i = j - 1
    span = cum[j] - cum[i]
    return i, (value - cum[i]) / span if span > 0 else 0.0


# --- Encoded polylines (Google algorithm) ----------------------------------------------------


def decode_polyline(encoded: str, precision: int = 6) -> list[Coord]:
    factor = 10.0**precision
    coords: list[Coord] = []
    index = lat = lon = 0
    length = len(encoded)
    while index < length:
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lon += delta
        coords.append((lat / factor, lon / factor))
    return coords


def encode_polyline(coords: Sequence[Coord], precision: int = 5) -> str:
    factor = 10**precision
    out: list[str] = []
    prev_lat = prev_lon = 0
    for lat, lon in coords:
        ilat, ilon = round(lat * factor), round(lon * factor)
        for delta in (ilat - prev_lat, ilon - prev_lon):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        prev_lat, prev_lon = ilat, ilon
    return "".join(out)


# --- Douglas-Peucker simplification ---------------------------------------------------------


def simplify_indices(coords: Sequence[Coord], tolerance_mi: float) -> list[int]:
    """Iterative Douglas-Peucker on a local equirectangular projection; returns kept indices."""
    n = len(coords)
    if n < 3:
        return list(range(n))
    mid_lat = radians((min(c[0] for c in coords) + max(c[0] for c in coords)) / 2)
    kx = cos(mid_lat) * 69.172  # miles per degree of longitude at mid latitude
    ky = 69.172
    xs = [c[1] * kx for c in coords]
    ys = [c[0] * ky for c in coords]
    tol2 = tolerance_mi * tolerance_mi
    keep = bytearray(n)
    keep[0] = keep[-1] = 1
    stack = [(0, n - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay, bx, by = xs[first], ys[first], xs[last], ys[last]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        max_d2, index = 0.0, -1
        for i in range(first + 1, last):
            px, py = xs[i] - ax, ys[i] - ay
            if seg2 == 0:
                d2 = px * px + py * py
            else:
                t = max(0.0, min(1.0, (px * dx + py * dy) / seg2))
                ex, ey = px - t * dx, py - t * dy
                d2 = ex * ex + ey * ey
            if d2 > max_d2:
                max_d2, index = d2, i
        if max_d2 > tol2:
            keep[index] = 1
            stack.append((first, index))
            stack.append((index, last))
    return [i for i in range(n) if keep[i]]
