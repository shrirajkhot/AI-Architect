"""
layout_validator.py
===================
Phase 3 — Demoted to safety net.

boundary_check_only() is the new primary entry point used by inference.py.
It only clamps rooms to the plot boundary; it does NOT push rooms apart.
If it fires, it means the Drafter produced an out-of-bounds room — log loudly.

validate_and_fix_layout() is kept for use by /vastu-fix and /regenerate-room,
which still work with LLM-edited geometry that may need collision resolution.
"""

from __future__ import annotations
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Configuration  (tune here, never hardcode below)
# ─────────────────────────────────────────────────────────────────────────────

WALL_THICKNESS_FT: float = 0.5
MIN_CORRIDOR_WIDTH_FT: float = 3.0
MAX_RESOLUTION_ITERATIONS: int = 50

# (min_width_ft, min_height_ft) per room type keyword
ROOM_MIN_DIMENSIONS: dict[str, tuple[float, float]] = {
    "master bedroom":  (10, 10),
    "bedroom":         (10, 10),
    "bathroom":        (5,  8),
    "toilet":          (4,  6),
    "kitchen":         (8, 10),
    "living":          (12, 12),
    "dining":          (10, 10),
    "hall":            (8,  6),
    "foyer":           (6,  6),
    "lobby":           (6,  6),
    "balcony":         (6,  4),
    "terrace":         (8,  6),
    "stair":           (6,  6),
    "lift":            (4,  4),
    "parking":         (12, 8),
    "pooja":           (6,  6),
    "prayer":          (6,  6),
    "study":           (8,  8),
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: Primary safety-net entry point (boundary clamp ONLY, no push-apart)
# ─────────────────────────────────────────────────────────────────────────────

def boundary_check_only(
    rooms: list[dict[str, Any]],
    plot_width: float,
    plot_height: float,
) -> tuple[list[dict], list[str]]:
    """
    Clamps rooms to plot boundary. Does NOT resolve overlaps or push rooms apart.
    Used by inference.py after the Drafter — if a room is clamped here it is a
    Drafter bug; the caller should log loudly.

    Returns (rooms, clamped_names) where clamped_names lists any rooms that were
    out of bounds (should be empty if the Drafter is working correctly).
    """
    clamped: list[str] = []
    if not plot_width or not plot_height:
        return rooms, clamped  # Skip if plot dimensions unknown

    for room in rooms:
        orig_x, orig_y = room["x"], room["y"]
        orig_w, orig_h = room.get("width", 0), room.get("height", 0)
        
        room["x"] = max(0.0, min(room["x"], plot_width  - room["width"]))
        room["y"] = max(0.0, min(room["y"], plot_height - room["height"]))
        
        # Clamp width/height if somehow larger than plot
        room["width"]  = min(room["width"],  plot_width)
        room["height"] = min(room["height"], plot_height)
        
        shrunk = room["width"] < orig_w or room["height"] < orig_h
        moved = room["x"] != orig_x or room["y"] != orig_y
        
        if shrunk:
            clamped.append(f"{room['name']} (area-shrunk w:{orig_w:.2f}->{room['width']:.2f} h:{orig_h:.2f}->{room['height']:.2f})")
        elif moved:
            clamped.append(room["name"])

    return rooms, clamped


# ─────────────────────────────────────────────────────────────────────────────
# Legacy full validation pipeline (kept for /vastu-fix and /regenerate-room)
# ─────────────────────────────────────────────────────────────────────────────

# Public entry point

def validate_and_fix_layout(
    rooms: list[dict[str, Any]],
    plot_width: float,
    plot_height: float,
    entrance_point: tuple[float, float] = (0.0, 0.0),
    max_iterations: int = MAX_RESOLUTION_ITERATIONS,
) -> dict[str, Any]:
    """
    Full deterministic geometry fixer.

    Parameters
    ----------
    rooms          : list of room dicts {name, x, y, width, height, furniture?, ...}
    plot_width     : plot dimension along x-axis in feet
    plot_height    : plot dimension along y-axis in feet
    entrance_point : (x, y) coordinate of the main entrance (default top-left)
    max_iterations : max overlap-resolution passes before giving up

    Returns
    -------
    {
        "rooms"            : list[dict],   # corrected, same schema as input
        "validation_report": list[str],    # human-readable log of all fixes
        "status"           : "ok" | "unresolved"
    }
    """
    report: list[str] = []

    if not rooms:
        return {"rooms": [], "validation_report": ["No rooms provided."], "status": "ok"}

    # Deep-copy to avoid mutating caller's data
    rooms = _deep_copy_rooms(rooms)

    # Step 1 — Per-type minimum dimension enforcement
    rooms, report = _enforce_minimum_dimensions(rooms, report, plot_width, plot_height)

    # Step 2 — Overlap detection and push-apart resolution
    rooms, report, resolved = _resolve_overlaps(rooms, report, max_iterations)

    # Step 3 — Wall-thickness gap enforcement
    rooms, report = _enforce_min_gap(rooms, report, WALL_THICKNESS_FT)

    # Step 4 — Boundary clamping  (LAST — resolution can push rooms out of bounds)
    rooms, report = _clamp_to_boundary(rooms, plot_width, plot_height, report)

    # Step 5 — Circulation reachability + corridor insertion
    rooms, report = _ensure_circulation(
        rooms, entrance_point, report, plot_width, plot_height
    )

    # Final sanity: re-clamp after corridor insertion (corridor itself may push)
    rooms, report = _clamp_to_boundary(rooms, plot_width, plot_height, report)

    # Check overall fit feasibility
    min_total_area = sum(
        _get_min_dims(r["name"])[0] * _get_min_dims(r["name"])[1]
        for r in rooms
    )
    plot_area = plot_width * plot_height
    if min_total_area > plot_area:
        report.append(
            f"UNRESOLVED: Plot area ({plot_area:.0f} sq ft) is too small for "
            f"{len(rooms)} rooms at minimum dimensions ({min_total_area:.0f} sq ft required)."
        )
        resolved = False

    status = "ok" if resolved else "unresolved"
    return {"rooms": rooms, "validation_report": report, "status": status}


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Per-type minimum dimension enforcement
# ─────────────────────────────────────────────────────────────────────────────

def _get_min_dims(name: str) -> tuple[float, float]:
    """Return (min_w, min_h) for a room by matching name keywords."""
    n = name.lower()
    for keyword, dims in ROOM_MIN_DIMENSIONS.items():
        if keyword in n:
            return dims
    return (6.0, 6.0)  # generic minimum


def _enforce_minimum_dimensions(
    rooms: list[dict],
    report: list[str],
    plot_w: float,
    plot_h: float,
) -> tuple[list[dict], list[str]]:
    for room in rooms:
        min_w, min_h = _get_min_dims(room["name"])
        changed = False

        if room["width"] < min_w:
            old = room["width"]
            room["width"] = min_w
            # Try to stay inside plot; shift x back if needed
            if room["x"] + room["width"] > plot_w:
                room["x"] = max(0.0, plot_w - room["width"])
            report.append(
                f"Min-dim: '{room['name']}' width {old:.1f}->{min_w:.1f} ft"
            )
            changed = True

        if room["height"] < min_h:
            old = room["height"]
            room["height"] = min_h
            if room["y"] + room["height"] > plot_h:
                room["y"] = max(0.0, plot_h - room["height"])
            report.append(
                f"Min-dim: '{room['name']}' height {old:.1f}->{min_h:.1f} ft"
            )
            changed = True

        if changed:
            room = _reclamp_furniture(room)

    return rooms, report


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — AABB overlap detection and minimum-translation-vector resolution
# ─────────────────────────────────────────────────────────────────────────────

def _aabb_overlap(a: dict, b: dict) -> tuple[float, float] | None:
    """
    Returns (dx, dy) minimum-translation vector to separate a from b,
    or None if they do not overlap.
    """
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["width"], ay1 + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["width"], by1 + b["height"]

    ox = min(ax2, bx2) - max(ax1, bx1)
    oy = min(ay2, by2) - max(ay1, by1)

    if ox <= 0 or oy <= 0:
        return None  # No overlap

    # Push apart along axis of least penetration
    if ox < oy:
        # Push horizontally
        if (ax1 + ax2) / 2 < (bx1 + bx2) / 2:
            return (-ox / 2, 0.0)   # push a left, b right
        return (ox / 2, 0.0)
    else:
        # Push vertically
        if (ay1 + ay2) / 2 < (by1 + by2) / 2:
            return (0.0, -oy / 2)   # push a up, b down
        return (0.0, oy / 2)


def _resolve_overlaps(
    rooms: list[dict],
    report: list[str],
    max_iterations: int,
) -> tuple[list[dict], list[str], bool]:
    resolved = True
    n = len(rooms)

    for iteration in range(max_iterations):
        found_overlap = False
        for i in range(n):
            for j in range(i + 1, n):
                mtv = _aabb_overlap(rooms[i], rooms[j])
                if mtv is None:
                    continue
                found_overlap = True
                dx, dy = mtv
                # Move each room by half the MTV in opposite directions
                rooms[i]["x"] -= dx
                rooms[i]["y"] -= dy
                rooms[j]["x"] += dx
                rooms[j]["y"] += dy
                # Re-clamp furniture for both moved rooms
                rooms[i] = _reclamp_furniture(rooms[i])
                rooms[j] = _reclamp_furniture(rooms[j])

        if not found_overlap:
            if iteration > 0:
                report.append(
                    f"Overlap-fix: All overlaps resolved after {iteration + 1} iteration(s)."
                )
            break
    else:
        # Exhausted max_iterations
        remaining = sum(
            1
            for i in range(n)
            for j in range(i + 1, n)
            if _aabb_overlap(rooms[i], rooms[j]) is not None
        )
        if remaining:
            report.append(
                f"UNRESOLVED: {remaining} room pair(s) still overlap after "
                f"{max_iterations} iterations. Plot may be overconstrained."
            )
            resolved = False

    return rooms, report, resolved


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Wall-thickness gap enforcement
# ─────────────────────────────────────────────────────────────────────────────

def _enforce_min_gap(
    rooms: list[dict],
    report: list[str],
    gap: float,
) -> tuple[list[dict], list[str]]:
    """
    After overlaps are resolved, push rooms apart so no two room boundaries
    are closer than `gap` ft unless they are truly separate floors.
    """
    n = len(rooms)
    adjusted_count = 0
    for i in range(n):
        for j in range(i + 1, n):
            a, b = rooms[i], rooms[j]
            ax2 = a["x"] + a["width"]
            bx2 = b["x"] + b["width"]
            ay2 = a["y"] + a["height"]
            by2 = b["y"] + b["height"]

            h_gap = min(ax2, bx2) - max(a["x"], b["x"])
            v_gap = min(ay2, by2) - max(a["y"], b["y"])

            # Only act on rooms that are adjacent (non-overlapping but touching)
            if 0 < h_gap and 0 < v_gap:
                continue  # they overlap — handled in Step 2

            # Check proximity on each axis
            x_sep = max(a["x"], b["x"]) - min(ax2, bx2)   # separation along x
            y_sep = max(a["y"], b["y"]) - min(ay2, by2)   # separation along y

            if 0 <= x_sep < gap and v_gap <= 0:
                # Rooms are too close horizontally
                push = (gap - x_sep) / 2
                if a["x"] < b["x"]:
                    rooms[i]["x"] -= push
                    rooms[j]["x"] += push
                else:
                    rooms[i]["x"] += push
                    rooms[j]["x"] -= push
                adjusted_count += 1

            elif 0 <= y_sep < gap and h_gap <= 0:
                # Rooms are too close vertically
                push = (gap - y_sep) / 2
                if a["y"] < b["y"]:
                    rooms[i]["y"] -= push
                    rooms[j]["y"] += push
                else:
                    rooms[i]["y"] += push
                    rooms[j]["y"] -= push
                adjusted_count += 1

    if adjusted_count:
        report.append(
            f"Wall-gap: Applied {gap} ft wall buffer to {adjusted_count} room pair(s)."
        )
        # Re-clamp furniture after positional shifts
        rooms = [_reclamp_furniture(r) for r in rooms]

    return rooms, report


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Boundary clamping (runs after resolution)
# ─────────────────────────────────────────────────────────────────────────────

def _clamp_to_boundary(
    rooms: list[dict],
    plot_w: float,
    plot_h: float,
    report: list[str],
) -> tuple[list[dict], list[str]]:
    clamped = 0
    for room in rooms:
        changed = False
        # Clamp position
        if room["x"] < 0:
            room["x"] = 0.0
            changed = True
        if room["y"] < 0:
            room["y"] = 0.0
            changed = True
        # Clamp size so room stays inside plot
        if room["x"] + room["width"] > plot_w:
            room["width"] = plot_w - room["x"]
            changed = True
        if room["y"] + room["height"] > plot_h:
            room["height"] = plot_h - room["y"]
            changed = True

        if changed:
            clamped += 1
            room = _reclamp_furniture(room)

    if clamped:
        report.append(f"Boundary-clamp: {clamped} room(s) clamped to plot boundary.")

    return rooms, report


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Circulation reachability + corridor insertion
# ─────────────────────────────────────────────────────────────────────────────

def _rooms_block_path(
    origin: dict,
    target: dict,
    all_rooms: list[dict],
) -> bool:
    """
    Simple check: is there a room whose bounding box fully blocks the
    direct rectilinear path between two room centroids?
    """
    cx_o = origin["x"] + origin["width"] / 2
    cy_o = origin["y"] + origin["height"] / 2
    cx_t = target["x"] + target["width"] / 2
    cy_t = target["y"] + target["height"] / 2

    for room in all_rooms:
        if room is origin or room is target:
            continue
        # Does the room's box fully contain the midpoint of the path?
        mid_x = (cx_o + cx_t) / 2
        mid_y = (cy_o + cy_t) / 2
        if (
            room["x"] < mid_x < room["x"] + room["width"]
            and room["y"] < mid_y < room["y"] + room["height"]
        ):
            return True
    return False


def _ensure_circulation(
    rooms: list[dict],
    entrance_point: tuple[float, float],
    report: list[str],
    plot_w: float,
    plot_h: float,
) -> tuple[list[dict], list[str]]:
    """
    Detects landlocked rooms (no doors, or doors with no adjacent room to reach).
    Does NOT insert corridors — auto-insertion was spawning overlapping rectangles.
    Instead, adds to the report so the API can surface circulation_warnings to the UI.
    """
    SKIP = {"staircase", "landing", "open area", "terrace", "balcony", "corridor"}
    warnings: list[str] = []

    for room in rooms:
        rname_lower = room["name"].lower()
        if any(s in rname_lower for s in SKIP):
            continue

        doors = room.get("doors", [])
        if not doors:
            warnings.append(f"'{room['name']}' has no door — may be inaccessible.")
            continue

        # Check each door: does it open onto a shared wall of any other room?
        rx0, ry0 = room["x"], room["y"]
        rx1, ry1 = rx0 + room["width"], ry0 + room["height"]
        door_reachable = False

        for door in doors:
            wall = door.get("wall", "")
            pos  = door.get("position", 0)
            dw   = door.get("width", 3)

            # Compute door segment endpoints in plot coordinates
            if wall == "bottom":
                d_x0, d_y0, d_x1, d_y1 = rx0 + pos, ry0, rx0 + pos + dw, ry0
            elif wall == "top":
                d_x0, d_y0, d_x1, d_y1 = rx0 + pos, ry1, rx0 + pos + dw, ry1
            elif wall == "left":
                d_x0, d_y0, d_x1, d_y1 = rx0, ry0 + pos, rx0, ry0 + pos + dw
            elif wall == "right":
                d_x0, d_y0, d_x1, d_y1 = rx1, ry0 + pos, rx1, ry0 + pos + dw
            else:
                continue

            # Any neighbour whose bounding box touches this wall segment?
            for other in rooms:
                if other is room:
                    continue
                ox0, oy0 = other["x"], other["y"]
                ox1, oy1 = ox0 + other["width"], oy0 + other["height"]
                # Ranges overlap (1-D check on both axes with 1 ft tolerance)
                h_overlap = d_x0 < ox1 + 1 and d_x1 > ox0 - 1
                v_overlap = d_y0 < oy1 + 1 and d_y1 > oy0 - 1
                if h_overlap and v_overlap:
                    door_reachable = True
                    break
            if door_reachable:
                break

        if not door_reachable:
            warnings.append(
                f"'{room['name']}' has door(s) but no adjacent room shares that wall — "
                "it may be landlocked."
            )

    if warnings:
        report.append("CIRCULATION_WARNINGS:" + "|".join(warnings))

    return rooms, report




# ─────────────────────────────────────────────────────────────────────────────
# Furniture helper — re-clamp furniture after a room is moved/resized
# ─────────────────────────────────────────────────────────────────────────────

def _reclamp_furniture(room: dict) -> dict:
    """Ensure all furniture stays inside the (possibly resized/moved) room."""
    updated = []
    for f in room.get("furniture", []):
        fw = min(f.get("width", 1), room["width"] - f.get("x", 0))
        fh = min(f.get("height", 1), room["height"] - f.get("y", 0))
        fx = max(0.0, min(f.get("x", 0), room["width"] - max(fw, 1)))
        fy = max(0.0, min(f.get("y", 0), room["height"] - max(fh, 1)))
        if fw > 0 and fh > 0:
            updated.append({**f, "x": fx, "y": fy, "width": fw, "height": fh})
    room["furniture"] = updated
    return room


# ─────────────────────────────────────────────────────────────────────────────
# Deep copy utility (avoids modifying the caller's dict)
# ─────────────────────────────────────────────────────────────────────────────

def _deep_copy_rooms(rooms: list[dict]) -> list[dict]:
    import copy
    return copy.deepcopy(rooms)
