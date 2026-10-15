"""
cost_rates.py
=============
INR material rate constants for the BOM engine (Phase 3).

All rates are per square foot (sqft) or per unit, based on Indian market
estimates (August 2026). These are baseline figures — users should add a
10–15% contingency for actual project budgeting.

Sources:
  - General residential construction: ₹1,800–₹2,500 / sqft (standard finish)
  - Regional market surveys (2026 estimates)
"""

from __future__ import annotations

# ── Structural & Core (per sqft of floor area) ─────────────────────────────
STRUCTURE_RCC_PER_SQFT = 400.0   # ₹/sqft — RCC framework and slab

# ── Wall construction (per sqft of wall face area) ────────────────────────────
BRICK_WALL_PER_SQFT   = 55.0   # ₹/sqft — 9-inch brick masonry
PLASTER_PER_SQFT      = 18.0   # ₹/sqft — both sides (internal + external)

# ── Flooring (per sqft of floor area) ────────────────────────────────────────
FLOORING_TILE_PER_SQFT    = 45.0   # ₹/sqft — standard vitrified tiles
FLOORING_MARBLE_PER_SQFT  = 120.0  # ₹/sqft — marble / granite (premium rooms)

# ── Ceiling (per sqft of floor area) ─────────────────────────────────────────
CEILING_PER_SQFT      = 35.0   # ₹/sqft — POP / gypsum false ceiling

# ── MEP: Electrical & Plumbing (per sqft of floor area) ──────────────────────
ELECTRICAL_PER_SQFT   = 80.0   # ₹/sqft — full wiring + fixtures
PLUMBING_PER_SQFT     = 60.0   # ₹/sqft — applies only to wet rooms (bathroom / kitchen)

# ── Painting (per sqft of floor area) ────────────────────────────────────────
PAINTING_PER_SQFT     = 22.0   # ₹/sqft — 2 coats emulsion

# ── Openings (per unit) ───────────────────────────────────────────────────────
DOOR_UNIT_COST        = 8_000.0   # ₹ per standard interior door
WINDOW_UNIT_COST      = 5_500.0   # ₹ per standard aluminium window

# ── Labour rate ───────────────────────────────────────────────────────────────
LABOUR_RATIO          = 0.30   # 30% of all material costs

# ── Tiers Multiplier ────────────────────────────────────────────────────────
TIER_MULTIPLIERS = {
    "economy": 0.8,
    "standard": 1.0,
    "premium": 1.5
}

# ── Ceiling height assumed throughout ─────────────────────────────────────────
CEILING_HEIGHT_FT     = 10.0

# ── Wet rooms (rooms that incur plumbing costs) ───────────────────────────────
WET_ROOM_KEYWORDS: tuple[str, ...] = (
    "bathroom", "toilet", "wc", "bath", "kitchen", "wash",
)

# ── Premium-flooring rooms (marble/granite instead of tiles) ─────────────────
PREMIUM_FLOOR_KEYWORDS: tuple[str, ...] = (
    "master bedroom", "living", "dining",
)
