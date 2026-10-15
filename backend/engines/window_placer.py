"""
window_placer.py
================
Deterministic window placement engine — Phase 1 of the roadmap.

Rules (per plan):
  1. Windows are only placed on EXTERIOR walls (walls on the plot boundary).
  2. A window must not overlap an existing door on the same wall.
     Exclusion = door.position → door.position + door.width + DOOR_CLEAR on each side.
  3. A window must not be within CORNER_CLEAR feet of a wall corner.
  4. If available wall space after exclusions is < WIN_MIN, skip that wall.
  5. Window width = min(WIN_MAX, available * WIN_RATIO), centred in available space.

Output: each room dict gains a "windows" key:
  windows: [{wall: str, position: float, width: float}]
"""

from __future__ import annotations
from typing import Any

# ── Constants ─────────────────────────────────────────────────────────────────
WIN_MIN     = 2.0    # ft — minimum useful window width
WIN_MAX     = 5.0    # ft — maximum window width
WIN_RATIO   = 0.40   # window spans up to 40% of clear wall space
CORNER_CLEAR = 1.5   # ft — min distance from wall corner
DOOR_CLEAR  = 0.5    # ft — clearance each side of a door opening


def _is_exterior(
    room: dict,
    wall: str,
    plot_w: float,
    plot_h: float,
    tol: float = 0.5,
) -> bool:
    """Return True if the given wall of this room lies on the plot boundary."""
    x, y, w, h = room["x"], room["y"], room["width"], room["height"]
    if wall == "top":    return y <= tol
    if wall == "bottom": return (y + h) >= (plot_h - tol)
    if wall == "left":   return x <= tol
    if wall == "right":  return (x + w) >= (plot_w - tol)
    return False


def _wall_length(room: dict, wall: str) -> float:
    """Return the span length (ft) of the given wall face."""
    return room["width"] if wall in ("top", "bottom") else room["height"]


def _door_exclusions(room: dict, wall: str) -> list[tuple[float, float]]:
    """
    Return a list of (start, end) blocked intervals along the wall
    caused by doors on that wall, including DOOR_CLEAR margins.
    """
    excluded: list[tuple[float, float]] = []
    for door in room.get("doors", []):
        if door.get("wall") != wall:
            continue
        pos = door.get("position", 0)
        dw  = door.get("width", 3)
        start = max(0.0, pos - DOOR_CLEAR)
        end   = pos + dw + DOOR_CLEAR
        excluded.append((start, end))
    return excluded


def _find_window_position(
    wall_len: float,
    excluded: list[tuple[float, float]],
) -> tuple[float, float] | None:
    """
    Find the largest clear interval on the wall (excluding corner zones and
    door exclusions), then fit a window centred within it.

    Returns (position, width) in feet, or None if no space.
    """
    # Sort and merge excluded intervals
    intervals = sorted(excluded)
    merged: list[tuple[float, float]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    # Build clear zones between corner_clear and (wall_len - corner_clear)
    usable_start = CORNER_CLEAR
    usable_end   = wall_len - CORNER_CLEAR
    if usable_end - usable_start < WIN_MIN:
        return None

    # Subtract door exclusions from the usable band
    clear_zones: list[tuple[float, float]] = [(usable_start, usable_end)]
    for excl_start, excl_end in merged:
        new_zones: list[tuple[float, float]] = []
        for (cs, ce) in clear_zones:
            if excl_end <= cs or excl_start >= ce:
                new_zones.append((cs, ce))   # no overlap
            else:
                if excl_start > cs:
                    new_zones.append((cs, excl_start))
                if excl_end < ce:
                    new_zones.append((excl_end, ce))
        clear_zones = new_zones

    if not clear_zones:
        return None

    # Pick the largest clear zone
    best = max(clear_zones, key=lambda z: z[1] - z[0])
    available = best[1] - best[0]
    if available < WIN_MIN:
        return None

    win_w = min(WIN_MAX, available * WIN_RATIO)
    if win_w < WIN_MIN:
        win_w = min(WIN_MIN, available)  # try at minimum width
        if available < win_w:
            return None

    # Centre window within the clear zone
    mid   = (best[0] + best[1]) / 2
    pos   = round(mid - win_w / 2, 2)
    return (pos, round(win_w, 2))


def place_windows(
    layout: dict,
    plot_w: float,
    plot_h: float,
) -> dict:
    """
    Mutate layout in-place: add a "windows" list to every room.
    Only places windows on exterior walls with sufficient clear space.

    Args:
        layout: The full {floors: [{rooms: [...]}]} dict from build_layout_from_topology.
        plot_w: Plot width in feet (x-axis).
        plot_h: Plot height in feet (y-axis).

    Returns:
        The mutated layout dict (same reference).
    """
    walls: list[str] = ["top", "bottom", "left", "right"]

    for floor in layout.get("floors", []):
        for room in floor.get("rooms", []):
            room_windows: list[dict[str, Any]] = []

            for wall in walls:
                if not _is_exterior(room, wall, plot_w, plot_h):
                    continue

                wall_len  = _wall_length(room, wall)
                excluded  = _door_exclusions(room, wall)
                result    = _find_window_position(wall_len, excluded)

                if result is not None:
                    pos, win_w = result
                    room_windows.append({
                        "wall":     wall,
                        "position": pos,
                        "width":    win_w,
                    })

            room["windows"] = room_windows

    return layout
