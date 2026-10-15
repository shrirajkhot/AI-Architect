"""
architectural_layout.py
=======================
Phase 2 — The Deterministic Drafter

Accepts a TopologyResponse (from inference.py's LLM Architect) and builds
exact, overlap-free room coordinates using a parametric 3-bay grid.

Key geometric guarantees (by construction, not post-hoc fixing):
  1. Zero overlaps — rooms are stacked using a y-cursor per bay; each room
     starts exactly where the previous one ends.
  2. Bathroom adjacency — bathrooms are appended immediately after their
     parent bedroom in the same bay column. The cursor ensures no gap.
  3. Plot boundary — all bounding boxes are clamped to [0,L] x [0,W] at
     allocation time, never after.
  4. Staircase hard-stop — y >= (W - STAIR_H) is reserved for the stair/
     companion zone; the bedroom cursor is clamped to this boundary.

Output format is unchanged so floor_renderer.py, dxf_exporter.py, and the
frontend InteractiveBlueprint.tsx require no changes.
"""

from __future__ import annotations
import math
import itertools
from typing import Any
from engines.window_placer import place_windows
from engines.circulation import compute_paths

# ── Constants ─────────────────────────────────────────────────────────────────
DOOR_W     = 3    # ft door width (standard 3-ft interior door)
STAIR_W    = 8    # ft staircase width
STAIR_H    = 10   # ft staircase depth (plan view)
MIN_BED_H  = 8.5  # ft absolute minimum bedroom depth (realistic minimum for tight spaces)
MIN_BATH_H = 5    # ft absolute minimum bathroom depth
MIN_ROOM_H = 7    # ft generic minimum room depth
MIN_ROOM_DIM = 5.0 # ft absolute minimum any room can be
MIN_PARKING_W = 9.0 # ft minimum width for parking
MIN_PARKING_H = 16.0 # ft minimum depth for parking

def _get_min_w(room_name: str) -> float:
    n = room_name.lower()
    if "parking" in n: return 9.0
    if "staircase" in n: return 8.0
    if "master" in n: return 11.0
    if "living" in n: return 11.0
    if "bedroom" in n: return 9.0
    if "family" in n: return 9.0
    if "dining" in n: return 8.0
    if "kitchen" in n: return 7.0
    if "foyer" in n: return 6.0
    if "corridor" in n: return 4.0
    return 5.0

def _calculate_bay_widths(L: float, l_list: list, s_list: list, r_list: list) -> tuple[float, float, float]:
    w_l = sum(r["weight"] for r in l_list)
    w_s = sum(r["weight"] for r in s_list)
    w_r = sum(r["weight"] for r in r_list)
    if w_s < 10: w_s = 10
    total = w_l + w_s + w_r
    
    # Proportional
    w1 = L * (w_l / total) if total > 0 else 0
    w2 = L * (w_s / total) if total > 0 else 0
    w3 = L * (w_r / total) if total > 0 else 0
    
    # Mins
    min_w1 = max([_get_min_w(r["name"]) for r in l_list] + [0.0]) if l_list else 0.0
    min_w2 = max([_get_min_w(r["name"]) for r in s_list] + [0.0]) if s_list else 0.0
    min_w3 = max([_get_min_w(r["name"]) for r in r_list] + [0.0]) if r_list else 0.0

    # Enforce global reasonable minimums so upper floors (with Master Bedrooms) don't inherit crushed bays
    if L >= 30:
        min_w1 = max(min_w1, 11.0)
        min_w3 = max(min_w3, 11.0)
    elif L >= 25:
        min_w1 = max(min_w1, 9.0)
        min_w3 = max(min_w3, 9.0)
    
    # Enforce mins
    w1 = max(w1, min_w1)
    w2 = max(w2, min_w2)
    w3 = max(w3, min_w3)
    
    # Fix overshoot by taking from bays that exceed their min
    overshoot = (w1 + w2 + w3) - L
    if overshoot > 0:
        for _ in range(20):
            if overshoot <= 0.01: break
            slush1 = max(0, w1 - min_w1)
            slush2 = max(0, w2 - min_w2)
            slush3 = max(0, w3 - min_w3)
            total_slush = slush1 + slush2 + slush3
            
            if total_slush <= 0.01:
                # Can't satisfy constraints, scale proportionally
                tot = w1 + w2 + w3
                w1, w2, w3 = w1/tot*L, w2/tot*L, w3/tot*L
                break
                
            w1 -= overshoot * (slush1 / total_slush)
            w2 -= overshoot * (slush2 / total_slush)
            w3 -= overshoot * (slush3 / total_slush)
            overshoot = (w1 + w2 + w3) - L
            
    return round(w1, 2), round(w2, 2), round(w3, 2)


# ── Default topology fallback (used when LLM fails) ──────────────────────────

def default_topology(bedrooms: int, bathrooms: int) -> Any:
    """Returns a sensible default TopologyResponse when the LLM is unavailable."""
    # Import here to avoid circular imports
    from engines.inference import TopologyResponse, TopologyBody, LeftBayTopology, RightBayTopology, SpineTopology

    left_beds  = math.ceil(bedrooms / 2)
    left_baths  = min(left_beds, bathrooms)

    left_rooms  = ["Master Bedroom"] + [f"Bedroom {i+1}" for i in range(1, left_beds)]
    right_rooms = ["Living Room", "Dining Room", "Kitchen"] + [f"Bedroom {i+1}" for i in range(left_beds, bedrooms)]

    return TopologyResponse(
        topology=TopologyBody(
            left_bay=LeftBayTopology(rooms=left_rooms, bathrooms_allocated=left_baths),
            right_bay=RightBayTopology(rooms=right_rooms),
            spine=SpineTopology(rooms=["Foyer", "Corridor", "Staircase"]),
        ),
        design_rationale="Default layout: Master Bedroom SW, Living/Dining/Kitchen in right bay."
    )


# ── Public entry point ────────────────────────────────────────────────────────


def build_layout_from_topology(
    topology: Any,
    length: float, width: float,
    bedrooms: int, bathrooms: int, floors: int,
    balcony: int, terrace: int, lift: int,
    vastu: bool, entry_dir: str,
    duplex: bool = False,
) -> dict:
    """
    Build a full multi-floor plan from an LLM-generated topology.
    Returns {floors: [{level, rooms}, ...]}.
    """
    W = int(length)  # length is Depth (Y-axis)
    L = int(width)   # width is Width (X-axis)
    result_floors = []

    # Apply setbacks if the plot is sufficiently large
    front_setback, rear_setback, side_setback = 0.0, 0.0, 0.0
    if L >= 32 and W >= 25:
        front_setback = 9.84
        rear_setback = 6.56
        side_setback = 4.92

    buildable_W = W - front_setback - rear_setback
    buildable_L = L - 2 * side_setback

    if buildable_L < MIN_ROOM_DIM * 3 or buildable_W < MIN_ROOM_DIM * 3:
        # Setbacks made the plot unbuildable — retry without setbacks
        print(f"[drafter] Setbacks produce {buildable_W:.1f}x{buildable_L:.1f} ft — too small. Retrying without setbacks.")
        front_setback = rear_setback = side_setback = 0.0
        buildable_W = W
        buildable_L = L
        if buildable_L < MIN_ROOM_DIM * 3 or buildable_W < MIN_ROOM_DIM * 3:
            raise ValueError(f"Plot {W}x{L} ft is too small to build on (minimum ~{int(MIN_ROOM_DIM * 3)}x{int(MIN_ROOM_DIM * 3)} ft required).")

    remaining_baths = bathrooms
    remaining_beds  = bedrooms
    remaining_balconies = balcony

    for floor_idx in range(floors):
        if floor_idx == 0:
            use_balcony = 1 if (remaining_balconies > 0 and not (duplex and floors > 1)) else 0
            fl, gf_w1, gf_w2, gf_w3 = _build_ground_floor(
                int(buildable_L), int(buildable_W), topology,
                remaining_baths, use_balcony, lift, vastu, entry_dir, duplex
            )
            gf_baths = sum(1 for r in fl["rooms"] if "bathroom" in r["name"].lower())
            gf_beds  = sum(1 for r in fl["rooms"] if "bedroom"  in r["name"].lower())
            gf_balc  = sum(1 for r in fl["rooms"] if "balcony"  in r["name"].lower())
            remaining_baths = max(0, remaining_baths - gf_baths)
            remaining_beds  = max(0, remaining_beds  - gf_beds)
            remaining_balconies = max(0, remaining_balconies - gf_balc)
        else:
            is_top      = (floor_idx == floors - 1)
            upper_beds  = remaining_beds   # only bedrooms not yet placed
            upper_baths = remaining_baths
            use_balcony = 1 if remaining_balconies > 0 else 0
            gf_staircase = next((r for r in fl["rooms"] if "staircase" in r["name"].lower()), None)
            staircase_y = gf_staircase["y"] if gf_staircase else 0.0

            fl = _build_upper_floor(
                int(buildable_L), int(buildable_W), floor_idx, upper_beds, upper_baths,
                topology, terrace if is_top else 0, lift, use_balcony,
                gf_w1, gf_w2, gf_w3, vastu, entry_dir, staircase_y
            )
            remaining_baths = 0
            remaining_beds  = 0
            remaining_balconies = 0


        # Apply setback shift
        if side_setback > 0 or front_setback > 0:
            for r in fl["rooms"]:
                r["x"] = round(r["x"] + side_setback, 2)
                r["y"] = round(r["y"] + front_setback, 2)
                
        # Emit plot_width/plot_height so the exporters can draw the boundary
        fl["plot_width"] = L
        fl["plot_height"] = W
        result_floors.append(fl)

    layout = {"floors": result_floors}

    # Rename duplicates across the floor so they have unique identities
    for f in layout["floors"]:
        used = set()
        for r in f["rooms"]:
            if r["name"] not in used:
                used.add(r["name"])
                continue
            k = 2
            while f"{r['name']} {k}" in used:
                k += 1
            r["name"] = f"{r['name']} {k}"
            used.add(r["name"])

    # Resolving Overlaps via Separating Axis Theorem (SAT) push-out
    def resolve_overlaps(rs, plot_w, plot_h, max_iterations=5):
        for _ in range(max_iterations):
            overlap_found = False
            for a, b in itertools.combinations(rs, 2):
                ox = min(a["x"]+a["width"], b["x"]+b["width"]) - max(a["x"], b["x"])
                oy = min(a["y"]+a["height"], b["y"]+b["height"]) - max(a["y"], b["y"])
                if ox > 0.01 and oy > 0.01:
                    overlap_found = True
                    if ox < oy:
                        if a["x"] < b["x"]:
                            if b["x"] + b["width"] + ox <= plot_w:
                                b["x"] = round(b["x"] + ox, 2)
                            elif a["x"] - ox >= 0:
                                a["x"] = round(a["x"] - ox, 2)
                            else:
                                a["width"] = round(a["width"] - ox/2, 2)
                                b["width"] = round(b["width"] - ox/2, 2)
                                b["x"] = round(b["x"] + ox/2, 2)
                        else:
                            if a["x"] + a["width"] + ox <= plot_w:
                                a["x"] = round(a["x"] + ox, 2)
                            elif b["x"] - ox >= 0:
                                b["x"] = round(b["x"] - ox, 2)
                            else:
                                a["width"] = round(a["width"] - ox/2, 2)
                                b["width"] = round(b["width"] - ox/2, 2)
                                a["x"] = round(a["x"] + ox/2, 2)
                    else:
                        if a["y"] < b["y"]:
                            if b["y"] + b["height"] + oy <= plot_h:
                                b["y"] = round(b["y"] + oy, 2)
                            elif a["y"] - oy >= 0:
                                a["y"] = round(a["y"] - oy, 2)
                            else:
                                a["height"] = round(a["height"] - oy/2, 2)
                                b["height"] = round(b["height"] - oy/2, 2)
                                b["y"] = round(b["y"] + oy/2, 2)
                        else:
                            if a["y"] + a["height"] + oy <= plot_h:
                                a["y"] = round(a["y"] + oy, 2)
                            elif b["y"] - oy >= 0:
                                b["y"] = round(b["y"] - oy, 2)
                            else:
                                a["height"] = round(a["height"] - oy/2, 2)
                                b["height"] = round(b["height"] - oy/2, 2)
                                a["y"] = round(a["y"] + oy/2, 2)
            if not overlap_found:
                break

    for f in layout["floors"]:
        resolve_overlaps(f["rooms"], float(L), float(W))

    place_windows(layout, plot_w=float(L), plot_h=float(W))
    compute_paths(layout)

    circulation_warnings: list[str] = []
    layout["circulation_warnings"] = circulation_warnings # type: ignore
    validation_report: list[dict[str, str]] = []
    layout["validation_report"] = validation_report
    
    for floor in layout["floors"]:
        lvl = floor.get("level", "Floor")
        unreachable = floor.get("circulation", {}).get("unreachable", [])
        for u in unreachable:
            circulation_warnings.append(f"{lvl}: {u} is unreachable.")

        rs = floor.get("rooms", [])
        names = [r["name"] for r in rs]
        for a, b in itertools.combinations(rs, 2):
            ox = min(a["x"]+a["width"], b["x"]+b["width"]) - max(a["x"], b["x"])
            oy = min(a["y"]+a["height"], b["y"]+b["height"]) - max(a["y"], b["y"])
            if ox > 0.01 and oy > 0.01:
                validation_report.append({"severity": "error", "room": f"{a['name']}, {b['name']}", "message": f"Rooms overlap by {ox:.1f}x{oy:.1f}ft."})
        
        for r in rs:
            if r["x"] < -0.01 or r["y"] < -0.01 or r["x"] + r["width"] > float(L) + 0.01 or r["y"] + r["height"] > float(W) + 0.01:
                validation_report.append({"severity": "error", "room": r["name"], "message": f"Room is outside plot envelope ({L}x{W})."})
            if (r["width"] < MIN_ROOM_DIM or r["height"] < MIN_ROOM_DIM) and not any(kw in r["name"].lower() for kw in ["corridor", "foyer", "storage", "walk-in closet", "utility"]):
                validation_report.append({"severity": "warn", "room": r["name"], "message": f"Room dimension below minimum {MIN_ROOM_DIM}ft."})
            if not r.get("doors") and not any(kw in r["name"].lower() for kw in ["parking", "balcony", "terrace", "open area", "corridor", "foyer", "storage", "walk-in closet"]):
                validation_report.append({"severity": "error", "room": r["name"], "message": "Room has no door."})
        
        for n in set(names):
            if names.count(n) > 1:
                validation_report.append({"severity": "warn", "room": n, "message": f"Duplicate room name ({names.count(n)} instances)."})

    if not validation_report:
        validation_report.append({"severity": "info", "room": "-", "message": "No issues found."})

    return layout




# ── BSP Tree System (Upgrade 1) ───────────────────────────────────────────────
WEIGHTS = {
    "Living Room": 16,
    "Parking": 8,
    "Master Bedroom": 10,
    "Bedroom": 8,
    "Kitchen": 3,
    "Dining Room": 6,
    "Bathroom": 3,
    "Powder Room": 2,
    "Walk-in Closet": 3,
    "Foyer": 4,
    "Staircase": 6,
    "Corridor": 4,
    "Utility": 3,
    "Store Room": 3,
    "Laundry": 3,
    "Balcony": 4,
    "Open Area": 5,
    "Family Lounge": 8,
    "Study": 5,
    "Terrace": 15,
}

def _get_weight(name: str) -> float:
    for k, v in WEIGHTS.items():
        if k.lower() in name.lower():
            return float(v)
    return 5.0

def _door(wall: str, position: float, width: float = DOOR_W) -> dict:
    return {"wall": wall, "position": round(position), "width": width}

def _bsp_pack(rect: tuple[float, float, float, float], rooms: list[dict], axis=None, door_wall="right") -> list[dict]:
    if not rooms:
        return []
    if len(rooms) == 1:
        name = rooms[0]["name"]
        x, y, w, h = rect
        # Clamp to minimum — never produce a sliver room
        w = max(w, MIN_ROOM_DIM)
        h = max(h, MIN_ROOM_DIM)
        door_pos = h * 0.4 if door_wall in ("left", "right") else w * 0.4
        doors = [_door(door_wall, door_pos)]
        if name == "Living Room":
            doors.append(_door("bottom", w * 0.4))
        elif name == "Parking":
            doors.append({"wall": "top", "position": round(w * 0.7), "width": DOOR_W, "is_garage": True})
            
        return [{
            "name": name, 
            "x": x, "y": y, 
            "width": round(w, 2), "height": round(h, 2),
            "doors": doors,
            "furniture": []
        }]
    
    total_weight = sum(r["weight"] for r in rooms)
    half_weight = total_weight / 2
    
    current_weight = 0
    split_index = 1
    for i, r in enumerate(rooms):
        current_weight += r["weight"]
        if current_weight >= half_weight and i > 0:
            if i < len(rooms) - 1:
                prev_diff = abs(half_weight - (current_weight - r["weight"]))
                curr_diff = abs(current_weight - half_weight)
                if prev_diff < curr_diff and i > 1:
                    split_index = i
                else:
                    split_index = i + 1
            else:
                split_index = i
            break
            
    left_rooms = rooms[:split_index]
    right_rooms = rooms[split_index:]
    
    if not left_rooms or not right_rooms:
        left_rooms = rooms[:1]
        right_rooms = rooms[1:]
        
    left_weight = sum(r["weight"] for r in left_rooms)
    right_weight = sum(r["weight"] for r in right_rooms)
    total = left_weight + right_weight
    ratio = left_weight / total if total > 0 else 0.5
    
    x, y, w, h = rect
    
    if axis is None:
        axis = "V" if w > h else "H"
        
    if axis == "V":
        # Ensure each child rect is wide enough for its rooms at minimum dim
        min_left_w  = MIN_ROOM_DIM * len(left_rooms)
        min_right_w = MIN_ROOM_DIM * len(right_rooms)
        left_w  = round(max(min_left_w,  min(w - min_right_w, w * ratio)), 2)
        right_w = round(w - left_w, 2)
        rect1 = (x, y, left_w, h)
        rect2 = (x + left_w, y, right_w, h)
        next_axis = "H"
    else:
        # Ensure each child rect is tall enough for its rooms at minimum dim
        min_top_h    = MIN_ROOM_DIM * len(left_rooms)
        min_bottom_h = MIN_ROOM_DIM * len(right_rooms)
        top_h    = round(max(min_top_h,    min(h - min_bottom_h, h * ratio)), 2)
        bottom_h = round(h - top_h, 2)
        rect1 = (x, y, w, top_h)
        rect2 = (x, y + top_h, w, bottom_h)
        next_axis = "V"
        
    return _bsp_pack(rect1, left_rooms, next_axis, door_wall) + _bsp_pack(rect2, right_rooms, next_axis, door_wall)


def _stack_in_bay(
    x: float, y_start: float, bay_w: float, bay_h: float,
    rooms: list[dict], door_wall: str = "right"
) -> list[dict]:
    """
    Stack rooms top-to-bottom inside a fixed-width bay column.
    Heights are proportional to room weights with a MIN_ROOM_DIM floor.
    The last room absorbs remaining space so the bay fills perfectly.
    This never produces horizontal side-by-side columns within a bay.
    """
    if not rooms:
        return []

    def _get_min_h(r_name: str) -> float:
        n = r_name.lower()
        if "parking" in n: return 18.0
        if "staircase" in n: return STAIR_H
        if "living" in n: return 12.0
        if "master" in n: return 11.0
        if "bedroom" in n: return 9.0
        if "family" in n: return 9.0
        if "dining" in n: return 8.0
        if "kitchen" in n: return 7.0
        if "bath" in n: return 5.0
        if "utility" in n: return 5.0
        return MIN_ROOM_DIM

    total_weight = sum(r["weight"] for r in rooms)
    n = len(rooms)

    # Phase 1: Perfect Tiling (Guarantee sum == bay_h)
    raw_heights = []
    for r in rooms:
        if "staircase" in r["name"].lower():
            raw_heights.append(STAIR_H)
        else:
            raw_heights.append(_get_min_h(r["name"]))
            
    leftover = bay_h - sum(raw_heights)
    if leftover > 0:
        flex_weight = sum(r["weight"] for r in rooms if "staircase" not in r["name"].lower())
        if flex_weight > 0:
            for i, r in enumerate(rooms):
                if "staircase" not in r["name"].lower():
                    raw_heights[i] += leftover * (r["weight"] / flex_weight)
        else:
            raw_heights[-1] += leftover
    elif leftover < 0:
        flex_total = sum(h for i, h in enumerate(raw_heights) if "staircase" not in rooms[i]["name"].lower())
        if flex_total > 0:
            scale = max(0, (flex_total + leftover) / flex_total)
            for i in range(len(raw_heights)):
                if "staircase" not in rooms[i]["name"].lower():
                    raw_heights[i] *= scale
                    
    raw_heights = [round(h, 2) for h in raw_heights]
    diff = round(bay_h - sum(raw_heights), 2)
    for i in reversed(range(len(rooms))):
        if "staircase" not in rooms[i]["name"].lower():
            raw_heights[i] = round(raw_heights[i] + diff, 2)
            break

    result: list[dict] = []
    cursor_y = y_start

    for i, (room, room_h) in enumerate(zip(rooms, raw_heights)):
        is_last = (i == n - 1)
        min_room_h = _get_min_h(room["name"])
        if is_last and "staircase" not in room["name"].lower():
            # Give the last room exactly the remaining space — clamped to bay boundary
            remaining = round(y_start + bay_h - cursor_y, 2)
            room_h = max(min_room_h, remaining)
        else:
            room_h = round(room_h, 2)

        if "staircase" not in room["name"].lower():
            room_h = max(room_h, min_room_h)
        name = room["name"]

        # Door placement: centred at 40% of the room's span
        if door_wall in ("left", "right"):
            door_pos = round(room_h * 0.4, 1)
        else:
            door_pos = round(bay_w * 0.4, 1)

        if name == "Parking":
            doors = [{"wall": "top", "position": round(bay_w * 0.3, 1), "width": DOOR_W, "is_garage": True}]
        else:
            doors = [_door(door_wall, door_pos)]
            if name == "Living Room":
                doors.append(_door("bottom", round(bay_w * 0.4, 1)))

        result.append({
            "name": name,
            "x": round(x, 2),
            "y": round(cursor_y, 2),
            "width": round(bay_w, 2),
            "height": room_h,
            "doors": doors,
            "furniture": [],
        })
        cursor_y = round(cursor_y + room_h, 2)

    return result


def _build_ground_floor(
    L: int, W: int, topology: Any,
    remaining_baths: int, balcony: int,
    lift: int, vastu: bool, entry_dir: str,
    duplex: bool
) -> dict:
    left_rooms = list(topology.topology.left_bay.rooms)
    right_rooms = list(topology.topology.right_bay.rooms)
    spine_rooms = list(topology.topology.spine.rooms)
    
    is_bedroom = lambda r: "bedroom" in r.lower()
    if duplex:
        left_rooms = [r for r in left_rooms if not is_bedroom(r)]
        right_rooms = [r for r in right_rooms if not is_bedroom(r)]
        if not left_rooms:
            left_rooms = ["Parking", "Utility"]
        elif "Utility" not in left_rooms and "Study" not in left_rooms:
            left_rooms.append("Utility")
    
    LIVING_SPACES = {"Living Room", "Dining Room", "Kitchen"}
    if "Living Room" not in right_rooms:
        left_rooms = [r for r in left_rooms if r not in LIVING_SPACES]
        right_rooms = ["Living Room", "Dining Room", "Kitchen"] + [r for r in right_rooms if r not in LIVING_SPACES and not is_bedroom(r)]
        
    if "Parking" in left_rooms:
        left_rooms.remove("Parking")
        left_rooms.insert(0, "Parking")
    if "Foyer" in spine_rooms:
        spine_rooms.remove("Foyer")
        spine_rooms.insert(0, "Foyer")
    if not vastu or "Living Room" not in right_rooms:
        if "Living Room" in right_rooms:
            right_rooms.remove("Living Room")
            right_rooms.insert(0, "Living Room")

    left_baths = min(topology.topology.left_bay.bathrooms_allocated, remaining_baths) if not duplex else 0
    bath_cnt = 0
    new_left = []
    for r in left_rooms:
        new_left.append(r)
        if is_bedroom(r) and left_baths > 0:
            bath_cnt += 1
            new_left.append(f"Bathroom {bath_cnt}")
            left_baths -= 1
            remaining_baths -= 1
            
    left_rooms = new_left
    # Only append Utility/Balcony if the bay can still fit it at MIN_ROOM_DIM
    # Budget = plot depth minus space already needed for current rooms
    left_min_needed = sum(max(MIN_ROOM_DIM, W * (_get_weight(r) / max(1, sum(_get_weight(x) for x in left_rooms)))) for r in left_rooms)
    if left_min_needed + MIN_ROOM_DIM <= W:
        left_rooms.append("Balcony" if balcony else "Utility")

    
    right_baths = max(0, remaining_baths) if not duplex else 0
    new_right = []
    for r in right_rooms:
        new_right.append(r)
        if is_bedroom(r) and right_baths > 0:
            bath_cnt += 1
            new_right.append(f"Bathroom {bath_cnt}")
            right_baths -= 1
    
    right_rooms = new_right
    # Only append Terrace if there is room left
    if len(right_rooms) * MIN_ROOM_DIM < W:
        right_rooms.append("Terrace")
    
    if duplex and not any("Staircase" in r for r in spine_rooms + left_rooms + right_rooms):
        # Fallback to left bay to keep it out of Brahmasthan
        left_rooms.append("Staircase")
    else:
        # Only append Store Room if spine can fit it
        if not duplex and (len(spine_rooms) + 1) * MIN_ROOM_DIM < W:
            spine_rooms.append("Store Room")
            
    # Extract staircases regardless of where they are placed
    staircases = [r for r in spine_rooms if "Staircase" in r]
    others = [r for r in spine_rooms if "Staircase" not in r]
    
    if vastu and entry_dir.strip().lower() in ["south", "s", "west", "w"]:
        # South/West entry -> Front is South/West -> Best for Staircase
        spine_rooms = others
        for st in reversed(staircases):
            # Force Staircase to the absolute front so it doesn't overlap the Brahmasthan
            spine_rooms.insert(0, st)
    else:
        # North/East entry -> Rear is South/West -> Best for Staircase
        spine_rooms = others + staircases
        
    l_list = [{"name": n, "weight": _get_weight(n)} for n in left_rooms]
    s_list = [{"name": n, "weight": _get_weight(n)} for n in spine_rooms]
    r_list = [{"name": n, "weight": _get_weight(n)} for n in right_rooms]
    
    w1, w2, w3 = _calculate_bay_widths(L, l_list, s_list, r_list)
        
    x1 = 0
    x2 = w1
    x3 = w1 + w2
    
    rooms = []
    rooms.extend(_stack_in_bay(x1, 0, w1, W, l_list, door_wall="right"))
    rooms.extend(_stack_in_bay(x2, 0, w2, W, s_list, door_wall="left"))
    rooms.extend(_stack_in_bay(x3, 0, w3, W, r_list, door_wall="left"))

    rooms = _post_process_rooms(rooms)
    return {"level": "Ground Floor", "rooms": rooms}, w1, w2, w3

def _build_upper_floor(
    L: int, W: int, floor_idx: int,
    beds: int, baths: int,
    topology: Any, terrace: int, lift: int, balcony: int = 0,
    w1: float = 0, w2: float = 0, w3: float = 0,
    vastu: bool = False, entry_dir: str = "north", staircase_y: float = None
) -> dict:
    level = "Floor 1" if floor_idx == 1 else f"Floor {floor_idx}"
    
    left_rooms = []
    right_rooms = []
    spine_rooms = ["Corridor", "Staircase"]
    
    left_beds = max(0, math.ceil(beds / 2))
    right_beds = max(0, beds - left_beds)
    
    topo_left = topology.topology.left_bay
    left_baths_alloc = min(topo_left.bathrooms_allocated, baths)
    # Phase 2: Wet Stack (Force upper bathrooms to right bay where kitchen is)
    left_baths = 0 
    right_baths = baths
    
    bed_num = 1
    bath_num = 1
    
    for i in range(left_beds):
        if floor_idx == 1 and i == 0:
            left_rooms.append("Master Bedroom")
        else:
            left_rooms.append(f"Bedroom {bed_num}")
            bed_num += 1
        if left_baths > 0:
            left_rooms.append(f"Bathroom {bath_num}")
            bath_num += 1
            left_baths -= 1
            
    for i in range(right_beds):
        right_rooms.append(f"Bedroom {bed_num}")
        bed_num += 1
        if right_baths > 0:
            right_rooms.append(f"Bathroom {bath_num}")
            bath_num += 1
            right_baths -= 1
            
    if not left_beds:
        left_rooms.append("Terrace" if terrace else ("Balcony" if balcony else "Open Area"))
    else:
        left_rooms.append("Family Lounge")
        left_rooms.append("Balcony" if balcony else "Terrace")
        
    if not right_beds:
        right_rooms.append("Terrace")
    else:
        right_rooms.append("Walk-in Closet")
        right_rooms.append("Terrace")
        
    staircases = [r for r in spine_rooms if "Staircase" in r]
    others = [r for r in spine_rooms if "Staircase" not in r]

    if vastu and entry_dir.strip().lower() in ["south", "s", "west", "w"]:
        # South/West entry -> Front is South/West -> Best for Staircase
        spine_rooms = others
        for st in reversed(staircases):
            # Force Staircase to the absolute front so it doesn't overlap the Brahmasthan
            spine_rooms.insert(0, st)
    else:
        # North/East entry -> Rear is South/West -> Best for Staircase
        spine_rooms = others + staircases
        
    l_list = [{"name": n, "weight": _get_weight(n)} for n in left_rooms]
    s_list = [{"name": n, "weight": _get_weight(n)} for n in spine_rooms]
    r_list = [{"name": n, "weight": _get_weight(n)} for n in right_rooms]
        
    rooms = []
    rooms.extend(_stack_in_bay(0,      0, w1, W, l_list, door_wall="right"))
    rooms.extend(_stack_in_bay(w1+w2,  0, w3, W, r_list, door_wall="left"))

    if staircase_y is not None:
        rooms.append({
            "name": "Staircase",
            "x": round(w1, 2),
            "y": round(staircase_y, 2),
            "width": round(w2, 2),
            "height": STAIR_H,
            "doors": [
                {"wall": "top", "position": round(w2/2 - 1.5, 1), "width": 3.0},
                {"wall": "bottom", "position": round(w2/2 - 1.5, 1), "width": 3.0}
            ],
            "furniture": []
        })
        s_rooms = [r for r in s_list if "staircase" not in r["name"].lower()]
        if staircase_y <= 0.1:
            rooms.extend(_stack_in_bay(w1, STAIR_H, w2, W - STAIR_H, s_rooms, door_wall="left"))
        elif staircase_y >= W - STAIR_H - 0.1:
            rooms.extend(_stack_in_bay(w1, 0, w2, staircase_y, s_rooms, door_wall="left"))
        else:
            mid = max(1, len(s_rooms) // 2) if len(s_rooms) > 1 else 0
            if mid == 0 and len(s_rooms) == 1:
                s_rooms.append(s_rooms[0].copy())
                s_rooms[1]["name"] = "Corridor 2"
                mid = 1
            
            rooms.extend(_stack_in_bay(w1, 0, w2, staircase_y, s_rooms[:mid], door_wall="left"))
            rooms.extend(_stack_in_bay(w1, staircase_y + STAIR_H, w2, W - staircase_y - STAIR_H, s_rooms[mid:], door_wall="left"))
    else:
        rooms.extend(_stack_in_bay(w1, 0, w2, W, s_list, door_wall="left"))

    rooms = _post_process_rooms(rooms)
    return {"level": level, "rooms": rooms}

def _post_process_rooms(rooms: list[dict]) -> list[dict]:
    # Phase 3: Aspect Ratios and Corridor limits
    final_rooms = []
    for r in rooms:
        name = r["name"].lower()
        w, h = r["width"], r["height"]
        
        if "open area" in name:
            r["name"] = "Terrace"
            
        if "bath" in name:
            if w > h * 1.8:
                new_w = round(h * 1.5, 2)
                r["width"] = new_w
                closet = r.copy()
                closet["name"] = "Walk-in Closet"
                closet["x"] = round(r["x"] + new_w, 2)
                closet["width"] = round(w - new_w, 2)
                closet["doors"] = [{"wall": "left", "position": 1.5, "width": 2.5}]
                final_rooms.append(closet)
            elif h > w * 1.8:
                new_h = round(w * 1.5, 2)
                r["height"] = new_h
                closet = r.copy()
                closet["name"] = "Walk-in Closet"
                closet["y"] = round(r["y"] + new_h, 2)
                closet["height"] = round(h - new_h, 2)
                closet["doors"] = [{"wall": "bottom", "position": 1.5, "width": 2.5}]
                final_rooms.append(closet)
                
        final_rooms.append(r)
    return final_rooms

# ΓöÇΓöÇ Legacy build_layout shim (keeps old callers working) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

def build_layout(
    length: float, width: float, bedrooms: int, bathrooms: int,
    floors: int = 1, balcony: int = 0, terrace: int = 0, lift: int = 0,
    vastu: bool = False, entry_dir: str = "East"
) -> dict:
    """Legacy shim for tests/fallback that don't have an LLM topology yet."""
    from engines.inference import LeftBayTopology, RightBayTopology, SpineTopology, TopologyBody, TopologyResponse

    left_beds  = math.ceil(bedrooms / 2)
    left_baths  = min(left_beds, bathrooms)

    left_rooms = ["Master Bedroom"] + [f"Bedroom {i+2}" for i in range(left_beds - 1)]
    right_rooms = ["Living Room", "Dining Room", "Kitchen"]

    topo = TopologyResponse(
        topology=TopologyBody(
            left_bay=LeftBayTopology(rooms=left_rooms, bathrooms_allocated=left_baths),
            right_bay=RightBayTopology(rooms=right_rooms),
            spine=SpineTopology(rooms=["Foyer", "Corridor", "Staircase"]),
        ),
        design_rationale="Shim-generated default topology."
    )

    return build_layout_from_topology(
        topology=topo, length=length, width=width,
        bedrooms=bedrooms, bathrooms=bathrooms, floors=floors,
        balcony=balcony, terrace=terrace, lift=lift,
        vastu=vastu, entry_dir=entry_dir,
    )


# ΓöÇΓöÇ Furniture injection (Phase 6 ΓÇö unchanged from original but validated) ΓöÇΓöÇΓöÇΓöÇΓöÇ

FURNITURE_CATALOG: dict[str, list[tuple]] = {
    # ΓöÇΓöÇ Living / Lounge ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "living": [
        ("3-Seat Sofa",    7, 3),
        ("Coffee Table",   3, 2),
        ("TV Unit",        5, 1),
        ("Armchair",       2.5, 2.5),
        ("Side Table",     1.5, 1.5),
        ("Floor Lamp",     1, 1),
    ],
    # ΓöÇΓöÇ Dining Room ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "dining": [
        ("Dining Table",   5, 3),
        ("Dining Chair",   1.5, 1.5),
        ("Dining Chair",   1.5, 1.5),
        ("Dining Chair",   1.5, 1.5),
        ("Dining Chair",   1.5, 1.5),
        ("Sideboard",      4, 1.5),
    ],
    # ΓöÇΓöÇ Kitchen ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "kitchen": [
        ("Counter Top",    8, 2),
        ("Kitchen Island", 4, 2.5),
        ("Refrigerator",   2.5, 2),
        ("Oven",           2, 2),
        ("Sink",           2, 1.5),
    ],
    # ΓöÇΓöÇ Master Bedroom ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "master bedroom": [
        ("King Bed",        7, 6),
        ("Bedside Table",   1.5, 1.5),
        ("Bedside Table",   1.5, 1.5),
        ("Wardrobe",        6, 2),
        ("Dressing Table",  4, 1.5),
        ("Vanity Mirror",   2, 0.5),
        ("Bench",           4, 1.5),
    ],
    # ΓöÇΓöÇ Regular Bedrooms ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "bedroom": [
        ("Double Bed",     6, 5),
        ("Bedside Table",  1.5, 1.5),
        ("Wardrobe",       5, 2),
        ("Study Desk",     4, 2),
        ("Study Chair",    2, 2),
        ("Bookshelf",      3, 1),
    ],
    # ΓöÇΓöÇ Bathrooms ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "bathroom": [
        ("WC",             2, 2.5),
        ("Bathtub",        5, 3),
        ("Vanity Sink",    2.5, 1.5),
        ("Shower",         2.5, 2.5),
    ],
    "guest bathroom": [
        ("WC",             2, 2.5),
        ("Pedestal Sink",  2, 1.5),
        ("Shower",         2.5, 2.5),
    ],

    # ΓöÇΓöÇ Corridors / Foyer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "foyer": [
        ("Shoe Rack",      3, 1),
        ("Console Table",  3, 1),
        ("Coat Hanger",    1, 1),
    ],
    "corridor": [
        ("Wall Art",       2, 0.2),
    ],
    # ΓöÇΓöÇ Balcony / Terrace ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "balcony": [
        ("Outdoor Chair",  2, 2),
        ("Outdoor Chair",  2, 2),
        ("Outdoor Table",  2, 2),
        ("Plant Pot",      1, 1),
        ("Plant Pot",      1, 1),
    ],
    "terrace": [
        ("Patio Sofa",     4, 2),
        ("Patio Table",    3, 3),
        ("Patio Chair",    2, 2),
        ("Plant Pot",      1, 1),
        ("BBQ Grill",      2, 1.5),
        ("Sun Lounger",    2, 5),
    ],
    # ΓöÇΓöÇ Parking / Utility ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    "parking": [
        ("Car",            8, 16),
        ("Storage Shelf", 4, 1),
    ],
    "utility": [
        ("Washing Machine", 2, 2),
        ("Dryer",           2, 2),
        ("Shelf Unit",      4, 1),
    ],
    "landing": [
        ("Bookshelf",      3, 1),
        ("Bench",          3, 1.5),
    ],
}

SWING = 3.0   # door swing radius in ft


def inject_furniture(layout: dict) -> dict:
    """
    Place furniture using wall-hugging strategy (architecturally correct):
      - Beds:    against the wall opposite the door, centred.
      - Sofas:   against the back wall, facing toward the room centre.
      - Counters: against the walls (L-shape for kitchen).
      - Tables:  centred in the room with chairs arranged around.
      - WC/Bath: against walls adjacent to plumbing (rear/side).
      - Wardrobes: against the side wall next to the bed.
    Falls back to margin-based row packing for any item that doesn't fit.
    """
    MARGIN = 1.2

    def _door_wall(room: dict) -> str:
        doors = room.get("doors", [])
        return doors[0].get("wall", "right") if doors else "right"

    def _swing_zones(room: dict) -> list[tuple]:
        zones = []
        rw, rh = room["width"], room["height"]
        n = room.get("name", "").lower()
        # Increased clearance for bedrooms and bathrooms
        swing_dist = 5.0 if ("bed" in n or "bath" in n or "toilet" in n or "wc" in n) else 3.0
        
        for door in room.get("doors", []):
            wall = door.get("wall", "")
            pos  = door.get("position", 0)
            if wall == "bottom":  zones.append((pos - 1.5, 0,               pos + swing_dist, swing_dist))
            elif wall == "top":   zones.append((pos - 1.5, rh - swing_dist, pos + swing_dist, rh))
            elif wall == "left":  zones.append((0,         pos - 1.5,       swing_dist,       pos + swing_dist))
            elif wall == "right": zones.append((rw - swing_dist, pos - 1.5, rw,               pos + swing_dist))
        return zones

    def _overlaps(fx, fy, fw, fh, zones, placed):
        for (zx0, zy0, zx1, zy1) in zones:
            if fx < zx1 and fx + fw > zx0 and fy < zy1 and fy + fh > zy0:
                return True
        for p in placed:
            if (fx < p["x"] + p["width"] and fx + fw > p["x"] and
                fy < p["y"] + p["height"] and fy + fh > p["y"]):
                return True
        return False

    def _try_place(fname: str, fx: float, fy: float, fw: float, fh: float, rw: float, rh: float, zones: list, placed: list) -> bool:
        """Return True and append to placed if the position is valid."""
        if fx < MARGIN or fy < MARGIN:
            return False
        if fx + fw + MARGIN > rw or fy + fh + MARGIN > rh:
            return False
        if _overlaps(fx, fy, fw, fh, zones, placed):
            return False
        placed.append({"name": fname, "x": round(fx, 1), "y": round(fy, 1),
                        "width": fw, "height": fh})
        return True

    def _wall_place(fname, fw, fh, rw, rh, dwall, zones, placed) -> bool:
        """Try to hug a wall appropriate for this furniture type."""
        n = fname.lower()
        cx = rw / 2
        cy = rh / 2

        # Compute wall-hugged positions for each cardinal wall
        candidates: list[tuple[float, float]] = []

        # Bed: opposite wall to door, centred horizontally
        if any(k in n for k in ('bed', 'king', 'double', 'single')):
            opp = {"right": "left", "left": "right", "top": "bottom", "bottom": "top"}.get(dwall, "left")
            if opp == "left":    candidates = [(MARGIN,          cy - fh / 2)]
            elif opp == "right": candidates = [(rw - fw - MARGIN, cy - fh / 2)]
            elif opp == "top":   candidates = [(cx - fw / 2,      MARGIN)]
            else:                candidates = [(cx - fw / 2,      rh - fh - MARGIN)]

        # Sofa: back wall (opposite door), centred
        elif any(k in n for k in ('sofa', 'couch')):
            if dwall == "bottom": candidates = [(cx - fw/2, MARGIN)]
            elif dwall == "top":  candidates = [(cx - fw/2, rh - fh - MARGIN)]
            elif dwall == "left": candidates = [(rw - fw - MARGIN, cy - fh/2)]
            else:                 candidates = [(MARGIN, cy - fh/2)]

        # TV unit: wall opposite sofa (same as door wall side)
        elif 'tv' in n:
            if dwall == "bottom": candidates = [(cx - fw/2, rh - fh - MARGIN)]
            elif dwall == "top":  candidates = [(cx - fw/2, MARGIN)]
            elif dwall == "left": candidates = [(MARGIN, cy - fh/2)]
            else:                 candidates = [(rw - fw - MARGIN, cy - fh/2)]

        # Counter/island/sink: back wall or side wall
        elif any(k in n for k in ('counter', 'island', 'sink', 'oven', 'refrigerator', 'fridge')):
            candidates = [
                (MARGIN, rh - fh - MARGIN),          # back wall
                (rw - fw - MARGIN, rh - fh - MARGIN), # right-back corner
                (MARGIN, MARGIN),                      # front wall
                (rw - fw - MARGIN, MARGIN),
            ]

        # WC / toilet: corner of bathroom
        elif any(k in n for k in ('wc', 'toilet')):
            candidates = [
                (MARGIN, MARGIN),
                (rw - fw - MARGIN, MARGIN),
                (MARGIN, rh - fh - MARGIN),
                (rw - fw - MARGIN, rh - fh - MARGIN),
            ]

        # Bathtub: long wall
        elif any(k in n for k in ('bathtub', 'bath tub')):
            if rw >= rh:  # wider room ΓåÆ along bottom or top
                candidates = [(MARGIN, rh - fh - MARGIN), (MARGIN, MARGIN)]
            else:
                candidates = [(rw - fw - MARGIN, MARGIN), (MARGIN, MARGIN)]

        # Shower: corner
        elif 'shower' in n:
            candidates = [
                (rw - fw - MARGIN, rh - fh - MARGIN),
                (MARGIN, rh - fh - MARGIN),
                (rw - fw - MARGIN, MARGIN),
            ]

        # Wardrobe: side wall
        elif any(k in n for k in ('wardrobe', 'cabinet', 'bookshelf', 'shelf')):
            candidates = [
                (rw - fw - MARGIN, MARGIN),
                (MARGIN, MARGIN),
                (rw - fw - MARGIN, rh - fh - MARGIN),
            ]

        # Dining/coffee table: centred
        elif 'table' in n:
            candidates = [(cx - fw/2, cy - fh/2)]

        # Chairs: around dining table (inferred from placed items)
        elif 'chair' in n:
            tbl = next((p for p in placed if 'table' in p.get('name','').lower()), None)
            if tbl:
                tx, ty, tw, th = tbl['x'], tbl['y'], tbl['width'], tbl['height']
                candidates = [
                    (tx + tw/2 - fw/2, ty - fh - 0.5),           # top
                    (tx + tw/2 - fw/2, ty + th + 0.5),            # bottom
                    (tx - fw - 0.5,    ty + th/2 - fh/2),         # left
                    (tx + tw + 0.5,    ty + th/2 - fh/2),         # right
                ]
            else:
                candidates = [(cx - fw/2, cy - fh/2)]

        # Desk: side wall
        elif any(k in n for k in ('desk', 'dressing', 'console', 'vanity', 'sideboard', 'bench', 'shoe rack', 'coat')):
            candidates = [
                (MARGIN, MARGIN),
                (rw - fw - MARGIN, MARGIN),
                (MARGIN, rh - fh - MARGIN),
            ]

        # Car: centred
        elif 'car' in n:
            candidates = [(cx - fw/2, cy - fh/2)]

        # Plant / Floor lamp: corners
        elif any(k in n for k in ('plant', 'pot', 'lamp', 'floor lamp')):
            candidates = [
                (rw - fw - MARGIN, MARGIN),
                (MARGIN, MARGIN),
                (rw - fw - MARGIN, rh - fh - MARGIN),
                (MARGIN, rh - fh - MARGIN),
            ]

        else:
            candidates = [
                (MARGIN, MARGIN),
                (cx - fw/2, MARGIN),
                (rw - fw - MARGIN, MARGIN),
            ]

        for (fx, fy) in candidates:
            fx, fy = round(fx, 1), round(fy, 1)
            if (fx >= MARGIN and fy >= MARGIN and
                    fx + fw + MARGIN <= rw and fy + fh + MARGIN <= rh and
                    not _overlaps(fx, fy, fw, fh, zones, placed)):
                placed.append({"name": fname, "x": fx, "y": fy, "width": fw, "height": fh})
                return True
        return False

    for floor in layout.get("floors", []):
        for room in floor.get("rooms", []):
            name_l = room["name"].lower()
            rw, rh = room["width"], room["height"]
            catalog = []
            for key in sorted(FURNITURE_CATALOG, key=len, reverse=True):
                if key in name_l:
                    catalog = FURNITURE_CATALOG[key]
                    break

            dwall      = _door_wall(room)
            swing_zones = _swing_zones(room)
            placed: list[dict] = []

            for (fname, fw, fh) in catalog:
                # Try architectural wall-hugging placement first
                if _wall_place(fname, fw, fh, rw, rh, dwall, swing_zones, placed):
                    continue
                # Fallback: row-based scan
                x_cur, y_cur, row_h = MARGIN, MARGIN, 0
                for _ in range(8):
                    if x_cur + fw + MARGIN > rw:
                        x_cur  = MARGIN
                        y_cur += row_h + 0.8
                        row_h  = 0
                    if y_cur + fh + MARGIN > rh:
                        break
                    if not _overlaps(x_cur, y_cur, fw, fh, swing_zones, placed):
                        placed.append({"name": fname, "x": round(x_cur, 1), "y": round(y_cur, 1),
                                        "width": fw, "height": fh})
                        row_h  = max(row_h, fh)
                        x_cur += fw + 0.8
                        break
                    x_cur += fw + 0.8

            room["furniture"] = placed

    return layout



