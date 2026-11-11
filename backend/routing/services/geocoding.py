"""Place search (autocomplete) via Photon (OpenStreetMap data), cached by normalised query."""

import hashlib

from django.conf import settings
from django.core.cache import cache

from .http import UpstreamError, session, timeout

MAX_RESULTS = 6


def _label(props: dict) -> str:
    parts = [props.get("name") or props.get("street")]
    for key in ("city", "county", "state", "countrycode"):
        value = props.get(key)
        if value and value not in parts:
            parts.append(value)
    return ", ".join(p for p in parts if p)


def search(query: str, near: tuple[float, float] | None = None) -> list[dict]:
    """Autocomplete; `near` biases ranking toward a point (e.g. the trip's other end), like Google."""
    normalised = " ".join(query.lower().split())
    bias = f"{near[0]:.1f},{near[1]:.1f}" if near else ""
    key = "geo:v2:" + hashlib.sha1(f"{normalised}|{bias}".encode(), usedforsecurity=False).hexdigest()
    if (cached := cache.get(key)) is not None:
        return cached
    try:
        resp = session().get(
            settings.PHOTON_URL,
            params={
                "q": normalised,
                "limit": MAX_RESULTS,
                "lang": "en",
                **({"lat": f"{near[0]:.3f}", "lon": f"{near[1]:.3f}"} if near else {}),
            },
            timeout=timeout(),
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
    except Exception as exc:
        raise UpstreamError("Place search is temporarily unavailable.", status=503) from exc

    results, seen = [], set()
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        label = _label(f.get("properties", {}))
        if label and label not in seen:
            seen.add(label)
            results.append({"label": label, "lat": round(lat, 6), "lon": round(lon, 6)})
    cache.set(key, results, settings.GEOCODE_CACHE_TTL_S)
    return results


def _area_label(props: dict) -> str:
    """Short, human place name for a reverse lookup, e.g. "Gulberg, Lahore"."""
    parts = []
    for key in ("district", "locality", "city", "county", "state"):
        value = props.get(key)
        if value and value not in parts:
            parts.append(value)
        if len(parts) == 2:
            break
    return ", ".join(parts) or props.get("name", "")


def reverse(lat: float, lon: float) -> str:
    """Place name near a coordinate (used to label the device's current location)."""
    key = f"rgeo:v1:{lat:.3f},{lon:.3f}"
    if (cached := cache.get(key)) is not None:
        return cached
    try:
        resp = session().get(
            settings.PHOTON_URL.replace("/api/", "/reverse"),
            params={"lat": f"{lat:.6f}", "lon": f"{lon:.6f}", "limit": 1, "lang": "en"},
            timeout=timeout(),
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
    except Exception as exc:
        raise UpstreamError("Place lookup is temporarily unavailable.", status=503) from exc
    label = _area_label(features[0].get("properties", {})) if features else ""
    cache.set(key, label, settings.GEOCODE_CACHE_TTL_S)
    return label
