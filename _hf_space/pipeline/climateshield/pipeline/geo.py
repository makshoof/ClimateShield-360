"""Geometry helpers that do not require GeoPandas."""

from __future__ import annotations

from typing import Any


def _first_pair(coords: Any) -> tuple[float, float] | None:
    current = coords
    while isinstance(current, (list, tuple)) and current and isinstance(current[0], (list, tuple)):
        current = current[0]
    if isinstance(current, (list, tuple)) and len(current) >= 2:
        try:
            return float(current[0]), float(current[1])
        except (TypeError, ValueError):
            return None
    return None


def _ring_mean(ring: Any) -> tuple[float, float] | None:
    if not isinstance(ring, list) or not ring:
        return None
    xs: list[float] = []
    ys: list[float] = []
    for point in ring:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            try:
                xs.append(float(point[0]))
                ys.append(float(point[1]))
            except (TypeError, ValueError):
                continue
    if not xs:
        return None
    return sum(xs) / len(xs), sum(ys) / len(ys)


def centroid_lon_lat(geometry: dict[str, Any] | None) -> tuple[float | None, float | None, bool]:
    """Return (lon, lat, approximate_flag)."""
    if not geometry:
        return None, None, False
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if geom_type == "Point":
        pair = _first_pair(coords)
        if pair:
            return pair[0], pair[1], False
        return None, None, False
    if geom_type == "Polygon" and isinstance(coords, list) and coords:
        pair = _ring_mean(coords[0])
        if pair:
            return pair[0], pair[1], True
    if geom_type == "MultiPolygon" and isinstance(coords, list) and coords:
        pair = _ring_mean(coords[0][0] if coords[0] else None)
        if pair:
            return pair[0], pair[1], True
    if geom_type in {"LineString", "MultiLineString", "GeometryCollection"}:
        pair = _first_pair(coords) if geom_type != "GeometryCollection" else None
        if pair:
            return pair[0], pair[1], True
        return None, None, True
    pair = _first_pair(coords)
    if pair:
        return pair[0], pair[1], True
    return None, None, False
