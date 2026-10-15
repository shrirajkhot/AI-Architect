"""
bom_engine.py
=============
Phase 3 — Bill of Materials (BOM) Cost Estimation Engine.

Takes a layout dict (same format returned by build_layout_from_topology) and
produces a detailed room-by-room cost breakdown in INR.

Output schema (returned by compute_bom):
{
    "rooms": [
        {
            "name":           str,
            "area_sqft":      float,
            "wall_area_sqft": float,
            "num_doors":      int,
            "num_windows":    int,
            "costs": {
                "structure":  float,   # RCC
                "wall":       float,   # brick + plaster
                "flooring":   float,
                "ceiling":    float,
                "electrical": float,
                "plumbing":   float,   # 0 if not a wet room
                "painting":   float,
                "doors":      float,
                "windows":    float,
                "material":   float,   # sum of above
                "labour":     float,   # LABOUR_RATIO × material
                "total":      float,   # material + labour
            }
        },
        ...
    ],
    "summary": {
        "total_area_sqft":    float,
        "material_total":     float,
        "labour_total":       float,
        "grand_total":        float,
        "rate_per_sqft":      float,   # grand_total / total_area
    }
}
"""

from __future__ import annotations
from engines.cost_rates import (
    STRUCTURE_RCC_PER_SQFT, BRICK_WALL_PER_SQFT, PLASTER_PER_SQFT,
    FLOORING_TILE_PER_SQFT, FLOORING_MARBLE_PER_SQFT,
    CEILING_PER_SQFT,
    ELECTRICAL_PER_SQFT, PLUMBING_PER_SQFT, PAINTING_PER_SQFT,
    DOOR_UNIT_COST, WINDOW_UNIT_COST,
    LABOUR_RATIO, CEILING_HEIGHT_FT,
    WET_ROOM_KEYWORDS, PREMIUM_FLOOR_KEYWORDS,
    TIER_MULTIPLIERS
)


def _is_wet_room(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in WET_ROOM_KEYWORDS)


def _is_premium_floor(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in PREMIUM_FLOOR_KEYWORDS)


def _room_bom(room: dict, tier: str = "standard") -> dict:
    """Compute the BOM breakdown for a single room dict."""
    name       = room.get("name", "Room")
    width_ft   = float(room.get("width",  0))
    height_ft  = float(room.get("height", 0))
    num_doors  = len(room.get("doors",   []))
    num_windows= len(room.get("windows", []))

    area_sqft      = width_ft * height_ft
    perimeter_ft   = 2 * (width_ft + height_ft)
    wall_area_sqft = perimeter_ft * CEILING_HEIGHT_FT
    
    tier_mult = TIER_MULTIPLIERS.get(tier, 1.0)

    # ── Material costs ────────────────────────────────────────────────────────
    structure_cost = area_sqft * STRUCTURE_RCC_PER_SQFT * tier_mult
    wall_cost      = wall_area_sqft * (BRICK_WALL_PER_SQFT + PLASTER_PER_SQFT) * tier_mult
    floor_rate     = FLOORING_MARBLE_PER_SQFT if _is_premium_floor(name) else FLOORING_TILE_PER_SQFT
    flooring_cost  = area_sqft   * floor_rate * tier_mult
    ceiling_cost   = area_sqft   * CEILING_PER_SQFT * tier_mult
    electrical_cost= area_sqft   * ELECTRICAL_PER_SQFT * tier_mult
    plumbing_cost  = (area_sqft   * PLUMBING_PER_SQFT * tier_mult) if _is_wet_room(name) else 0.0
    painting_cost  = area_sqft   * PAINTING_PER_SQFT * tier_mult
    door_cost      = num_doors   * DOOR_UNIT_COST * tier_mult
    window_cost    = num_windows * WINDOW_UNIT_COST * tier_mult

    material_total = (
        structure_cost + wall_cost + flooring_cost + ceiling_cost
        + electrical_cost + plumbing_cost + painting_cost
        + door_cost + window_cost
    )
    labour_cost  = round(material_total * LABOUR_RATIO,  2)
    room_total   = round(material_total + labour_cost,   2)

    return {
        "name":           name,
        "area_sqft":      round(area_sqft,      2),
        "wall_area_sqft": round(wall_area_sqft, 2),
        "num_doors":      num_doors,
        "num_windows":    num_windows,
        "costs": {
            "structure":  round(structure_cost,  2),
            "wall":       round(wall_cost,       2),
            "flooring":   round(flooring_cost,   2),
            "ceiling":    round(ceiling_cost,    2),
            "electrical": round(electrical_cost, 2),
            "plumbing":   round(plumbing_cost,   2),
            "painting":   round(painting_cost,   2),
            "doors":      round(door_cost,       2),
            "windows":    round(window_cost,     2),
            "material":   round(material_total,  2),
            "labour":     labour_cost,
            "total":      room_total,
        },
    }


def compute_bom(layout_or_rooms: dict | list, sqft: float = 0.0, tier: str = "standard") -> dict:
    """
    Compute a full BOM for all rooms across all floors or a raw list of rooms.

    Args:
        layout_or_rooms: The full {floors: [{rooms: [...]}]} dict, or {rooms: [...]}, or list of room dicts.
        sqft: Optional square footage float.
        tier: Material quality tier ("economy", "standard", "premium").

    Returns:
        BOM dict with per-room breakdown and project summary.
    """
    all_room_boms: list[dict] = []

    if isinstance(layout_or_rooms, dict):
        floors = layout_or_rooms.get("floors", [])
        if floors:
            for floor in floors:
                for room in floor.get("rooms", []):
                    all_room_boms.append(_room_bom(room, tier))
        elif "rooms" in layout_or_rooms:
            for room in layout_or_rooms.get("rooms", []):
                all_room_boms.append(_room_bom(room, tier))
    elif isinstance(layout_or_rooms, list):
        for room in layout_or_rooms:
            all_room_boms.append(_room_bom(room, tier))

    # ── Summary ───────────────────────────────────────────────────────────────
    total_area     = sum(r["area_sqft"]          for r in all_room_boms)
    material_total = sum(r["costs"]["material"]  for r in all_room_boms)
    labour_total   = sum(r["costs"]["labour"]    for r in all_room_boms)
    grand_total    = sum(r["costs"]["total"]     for r in all_room_boms)
    rate_per_sqft  = round(grand_total / total_area, 2) if total_area else 0.0

    return {
        "rooms": all_room_boms,
        "summary": {
            "total_area_sqft": round(total_area,     2),
            "material_total":  round(material_total, 2),
            "labour_total":    round(labour_total,   2),
            "grand_total":     round(grand_total,    2),
            "rate_per_sqft":   rate_per_sqft,
        },
    }
