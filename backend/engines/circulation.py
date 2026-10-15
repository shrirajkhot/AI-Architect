"""
circulation.py
==============
Phase 2 — Circulation Path Visualization.

Builds a room adjacency graph from the layout geometry and runs BFS from the
entrance room to every other room, returning walking paths as (x, y) waypoint
arrays that the frontend can render as dashed SVG polylines.

A path from room A → room B visits each intermediate room by:
  1. Starting at the centre of room A
  2. Stepping through the shared wall midpoint between adjacent rooms
  3. Arriving at the centre of room B

Rooms with no BFS path to the entrance are flagged as "unreachable" and added
to the circulation_warnings list.
"""

from __future__ import annotations
from collections import deque
from typing import Any


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _room_centre(room: dict) -> tuple[float, float]:
    return (room["x"] + room["width"] / 2, room["y"] + room["height"] / 2)


def _door_bbox(room: dict, door: dict) -> tuple[float, float, float, float]:
    rx, ry = room["x"], room["y"]
    w = door.get("width", 3.0)
    pos = door.get("position", 0.0)
    wall = door["wall"]
    T = 0.5
    if wall == "top": return (rx + pos, rx + pos + w, ry - T, ry + T)
    if wall == "bottom": return (rx + pos, rx + pos + w, ry + room["height"] - T, ry + room["height"] + T)
    if wall == "left": return (rx - T, rx + T, ry + pos, ry + pos + w)
    if wall == "right": return (rx + room["width"] - T, rx + room["width"] + T, ry + pos, ry + pos + w)
    return (0, 0, 0, 0)

def _shared_door_midpoint(a: dict, b: dict) -> tuple[float, float] | None:
    """
    Returns the midpoint of a door connecting room a and room b.
    If no door connects them, returns None.
    """
    for r1, r2 in [(a, b), (b, a)]:
        for door in r1.get("doors", []):
            x1, x2, y1, y2 = _door_bbox(r1, door)
            r2x1, r2x2 = r2["x"], r2["x"] + r2["width"]
            r2y1, r2y2 = r2["y"], r2["y"] + r2["height"]
            
            # Check intersection
            if (x1 <= r2x2 + 0.1 and x2 >= r2x1 - 0.1 and 
                y1 <= r2y2 + 0.1 and y2 >= r2y1 - 0.1):
                return ((x1 + x2) / 2, (y1 + y2) / 2)
    return None


def _build_adjacency(rooms: list[dict]) -> dict[str, list[tuple[str, tuple[float, float]]]]:
    """
    Return an adjacency map: room_name → [(neighbour_name, shared_wall_midpoint), ...]
    """
    adj: dict[str, list[tuple[str, tuple[float, float]]]] = {r["name"]: [] for r in rooms}
    for i, a in enumerate(rooms):
        for j in range(i + 1, len(rooms)):
            b = rooms[j]
            midpt = _shared_door_midpoint(a, b)
            if midpt is not None:
                adj[a["name"]].append((b["name"], midpt))
                adj[b["name"]].append((a["name"], midpt))
    return adj


def _find_entrance(rooms: list[dict]) -> str | None:
    """
    Find the entrance room by name priority:
      Foyer > Entrance > Hall > Lobby > Corridor > first room.
    """
    priority = ["foyer", "entrance", "hall", "lobby", "corridor"]
    for keyword in priority:
        for r in rooms:
            if keyword in r["name"].lower():
                return r["name"]
    return rooms[0]["name"] if rooms else None


# ── Public API ────────────────────────────────────────────────────────────────

def compute_paths(
    layout: dict,
) -> dict:
    """
    Add circulation data to the layout dict (mutates in-place).

    For each floor, adds:
      floor["circulation"] = {
          "paths": [
              {
                  "to": "<room_name>",
                  "waypoints": [[x, y], [x, y], ...]   # in feet, SVG coords
              },
              ...
          ],
          "unreachable": ["<room_name>", ...]
      }

    Returns the mutated layout dict.
    """
    for floor in layout.get("floors", []):
        rooms: list[dict] = floor.get("rooms", [])
        if not rooms:
            floor["circulation"] = {"paths": [], "unreachable": []}
            continue

        room_map: dict[str, dict] = {r["name"]: r for r in rooms}
        adj = _build_adjacency(rooms)
        entrance_name = _find_entrance(rooms)

        if entrance_name is None:
            floor["circulation"] = {"paths": [], "unreachable": []}
            continue

        # BFS from entrance
        visited: dict[str, str | None] = {entrance_name: None}
        # Store the waypoint used to reach each room: {name: (wall_midpoint)}
        via: dict[str, tuple[float, float] | None] = {entrance_name: None}
        queue: deque[str] = deque([entrance_name])

        while queue:
            current = queue.popleft()
            for neighbour, midpoint in adj[current]:
                if neighbour not in visited:
                    visited[neighbour] = current
                    via[neighbour] = midpoint
                    queue.append(neighbour)

        # Build path objects
        paths: list[dict[str, Any]] = []
        unreachable: list[str] = []

        for room in rooms:
            name = room["name"]
            if name == entrance_name:
                continue
            if name not in visited:
                unreachable.append(name)
                continue

            # Reconstruct path backwards from this room to entrance
            waypoints: list[list[float]] = []
            waypoints.append(list(_room_centre(room_map[name])))

            step = name
            while visited[step] is not None:
                parent = visited[step]
                assert parent is not None
                # Add the shared wall midpoint
                mid = via[step]
                if mid is not None:
                    waypoints.append(list(mid))
                waypoints.append(list(_room_centre(room_map[parent])))
                step = parent

            waypoints.reverse()
            paths.append({"to": name, "waypoints": waypoints})

        floor["circulation"] = {"paths": paths, "unreachable": unreachable}

    return layout
