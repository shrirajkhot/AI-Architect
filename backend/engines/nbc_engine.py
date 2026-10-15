"""
nbc_engine.py
=============
Phase 4 — Municipal Bylaw Compliance Engine (Indian National Building Code 2016).

Mirrors the structure of vastu_engine.py exactly:
  score_nbc(rooms, plot_w, plot_h, num_floors) → {score, grade, rules}

Rules implemented (8 rules, total weight = 100):

  Rule 1:  Front Setback         — 3.0 m minimum      (weight 15)
  Rule 2:  Rear Setback          — 2.0 m minimum      (weight 10)
  Rule 3:  Side Setbacks         — 1.5 m each side    (weight 10)
  Rule 4:  Floor Area Ratio      — ≤ 1.5 for plots <500 sqm (weight 20)
  Rule 5:  Habitable Room Area   — ≥ 9.5 sqm (≈102 sqft)   (weight 15)
  Rule 6:  Kitchen Minimum Area  — ≥ 5.0 sqm (≈54 sqft)    (weight 10)
  Rule 7:  Bathroom Minimum Area — ≥ 2.8 sqm (≈30 sqft)    (weight 10)
  Rule 8:  Corridor/Passage Width— ≥ 1.0 m (≈3.3 ft)       (weight 10)

All dimensions in feet (1 ft = 0.3048 m).
"""

from __future__ import annotations

SQFT_TO_SQM = 0.0929    # 1 sq ft = 0.0929 sq m
FT_TO_M     = 0.3048    # 1 ft    = 0.3048 m

# ── Minimum area constants in sqft (NBC 2016 → converted from sq m) ───────────
MIN_HABITABLE_SQFT = 102.0   # 9.5 sqm
MIN_KITCHEN_SQFT   =  54.0   # 5.0 sqm
MIN_BATHROOM_SQFT  =  30.0   # 2.8 sqm
MIN_CORRIDOR_FT    =   3.3   # 1.0 m

# ── Setbacks in feet ──────────────────────────────────────────────────────────
MIN_FRONT_SETBACK_FT  = 9.84    # 3.0 m
MIN_REAR_SETBACK_FT   = 6.56    # 2.0 m
MIN_SIDE_SETBACK_FT   = 4.92    # 1.5 m

# ── FAR limits ────────────────────────────────────────────────────────────────
FAR_LIMIT_SMALL  = 1.5    # plots < 500 sqm
FAR_LIMIT_MEDIUM = 1.25   # plots 500–1000 sqm
FAR_LIMIT_LARGE  = 1.0    # plots > 1000 sqm

WEIGHTS = {
    "front_setback":    15,
    "rear_setback":     10,
    "side_setbacks":    10,
    "far":              20,
    "habitable_area":   15,
    "kitchen_area":     10,
    "bathroom_area":    10,
    "corridor_width":   10,
}   # Total = 100


def _classify(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ["bedroom", "living", "lounge", "dining"]):
        return "habitable"
    if "kitchen" in n:
        return "kitchen"
    if any(k in n for k in ["bath", "toilet", "wc"]):
        return "bathroom"
    if any(k in n for k in ["corridor", "passage", "hall", "lobby"]):
        return "corridor"
    return "other"


def _bounding_box(rooms: list[dict]) -> tuple[float, float, float, float]:
    """Return (min_x, min_y, max_x, max_y) of all rooms."""
    min_x = min(r["x"] for r in rooms)
    min_y = min(r["y"] for r in rooms)
    max_x = max(r["x"] + r["width"]  for r in rooms)
    max_y = max(r["y"] + r["height"] for r in rooms)
    return min_x, min_y, max_x, max_y


def score_nbc(
    rooms: list[dict],
    plot_w: float,
    plot_h: float,
    num_floors: int = 1,
) -> dict:
    """
    Score a layout against 8 NBC 2016 residential rules.

    Args:
        rooms:      All rooms on a single floor (x, y, width, height in feet).
        plot_w:     Plot width in feet (the "length" parameter from the form).
        plot_h:     Plot height in feet (the "width" parameter from the form).
        num_floors: Number of floors (affects FAR calculation).

    Returns:
        {score: int, grade: str, rules: [{rule, status, points, max, detail}]}
    """
    if not rooms:
        return {"score": 0, "grade": "N/A", "rules": []}

    results: list[dict] = []
    total = 0

    min_x, min_y, max_x, max_y = _bounding_box(rooms)
    plot_sqft   = plot_w * plot_h
    plot_sqm    = plot_sqft * SQFT_TO_SQM

    typed = [(r, _classify(r["name"])) for r in rooms]

    # ── Rule 1: Front Setback ─────────────────────────────────────────────────
    w = WEIGHTS["front_setback"]
    front_setback_ft = min_y   # distance from top of plot to first room
    front_m = front_setback_ft * FT_TO_M

    if front_setback_ft >= MIN_FRONT_SETBACK_FT:
        pts, status = w, "pass"
        detail = f"Front setback = {front_m:.1f} m ✅ (min 3.0 m)"
    elif front_setback_ft >= MIN_FRONT_SETBACK_FT * 0.6:
        pts = round(w * 0.5)
        status = "warn"
        detail = f"Front setback = {front_m:.1f} m ⚠ (min 3.0 m — marginally short)"
    else:
        pts, status = 0, "fail"
        detail = f"Front setback = {front_m:.1f} m ❌ (min 3.0 m required by NBC 2016)"

    results.append({"rule": "Front Setback", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 2: Rear Setback ──────────────────────────────────────────────────
    w = WEIGHTS["rear_setback"]
    rear_setback_ft = plot_h - max_y
    rear_m = rear_setback_ft * FT_TO_M

    if rear_setback_ft >= MIN_REAR_SETBACK_FT:
        pts, status = w, "pass"
        detail = f"Rear setback = {rear_m:.1f} m ✅ (min 2.0 m)"
    elif rear_setback_ft >= MIN_REAR_SETBACK_FT * 0.5:
        pts = round(w * 0.5)
        status = "warn"
        detail = f"Rear setback = {rear_m:.1f} m ⚠ (min 2.0 m — marginally short)"
    else:
        pts, status = 0, "fail"
        detail = f"Rear setback = {rear_m:.1f} m ❌ (min 2.0 m required by NBC 2016)"

    results.append({"rule": "Rear Setback", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 3: Side Setbacks ─────────────────────────────────────────────────
    w = WEIGHTS["side_setbacks"]
    left_setback_ft  = min_x
    right_setback_ft = plot_w - max_x
    min_side = min(left_setback_ft, right_setback_ft)
    min_side_m = min_side * FT_TO_M

    if min_side >= MIN_SIDE_SETBACK_FT:
        pts, status = w, "pass"
        detail = f"Side setbacks = {left_setback_ft:.1f} ft / {right_setback_ft:.1f} ft ✅ (min 4.9 ft / 1.5 m each)"
    elif min_side >= MIN_SIDE_SETBACK_FT * 0.5:
        pts = round(w * 0.5)
        status = "warn"
        detail = f"Minimum side setback = {min_side_m:.1f} m ⚠ (min 1.5 m recommended)"
    else:
        pts, status = 0, "fail"
        detail = f"Minimum side setback = {min_side_m:.1f} m ❌ (min 1.5 m required by NBC 2016)"

    results.append({"rule": "Side Setbacks", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 4: Floor Area Ratio ──────────────────────────────────────────────
    w = WEIGHTS["far"]
    total_floor_area_sqft = sum(r["width"] * r["height"] for r in rooms) * num_floors
    total_floor_sqm = total_floor_area_sqft * SQFT_TO_SQM
    actual_far = total_floor_sqm / plot_sqm if plot_sqm > 0 else 0

    far_limit = (
        FAR_LIMIT_SMALL  if plot_sqm < 500  else
        FAR_LIMIT_MEDIUM if plot_sqm < 1000 else
        FAR_LIMIT_LARGE
    )

    if actual_far <= far_limit:
        pts, status = w, "pass"
        detail = f"FAR = {actual_far:.2f} ✅ (limit {far_limit} for {plot_sqm:.0f} sqm plot)"
    elif actual_far <= far_limit * 1.15:
        pts = round(w * 0.55)
        status = "warn"
        detail = f"FAR = {actual_far:.2f} ⚠ (limit {far_limit} — slightly over)"
    else:
        pts, status = 0, "fail"
        detail = f"FAR = {actual_far:.2f} ❌ (limit {far_limit} for this plot size)"

    results.append({"rule": "Floor Area Ratio (FAR)", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 5: Habitable Room Minimum Area ───────────────────────────────────
    w = WEIGHTS["habitable_area"]
    habitable = [(r, _classify(r["name"])) for r in rooms if _classify(r["name"]) == "habitable"]
    if habitable:
        failing = [r["name"] for r, _ in habitable
                   if r["width"] * r["height"] < MIN_HABITABLE_SQFT]
        if not failing:
            pts, status = w, "pass"
            detail = f"All {len(habitable)} habitable rooms ≥ {MIN_HABITABLE_SQFT:.0f} sqft (9.5 sqm) ✅"
        elif len(failing) < len(habitable):
            pts = round(w * 0.5)
            status = "warn"
            detail = f"{len(failing)} room(s) below min area: {', '.join(failing)}"
        else:
            pts, status = 0, "fail"
            detail = f"All habitable rooms below 9.5 sqm minimum: {', '.join(failing)}"
    else:
        pts = round(w * 0.5)
        status = "warn"
        detail = "No habitable rooms detected (bedroom/living/dining)"

    results.append({"rule": "Habitable Room Min. Area", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 6: Kitchen Minimum Area ──────────────────────────────────────────
    w = WEIGHTS["kitchen_area"]
    kitchens = [r for r, t in typed if t == "kitchen"]
    if kitchens:
        min_kitchen_sqft = min(r["width"] * r["height"] for r in kitchens)
        if min_kitchen_sqft >= MIN_KITCHEN_SQFT:
            pts, status = w, "pass"
            detail = f"Kitchen = {min_kitchen_sqft:.0f} sqft ✅ (min {MIN_KITCHEN_SQFT:.0f} sqft / 5.0 sqm)"
        elif min_kitchen_sqft >= MIN_KITCHEN_SQFT * 0.75:
            pts = round(w * 0.5)
            status = "warn"
            detail = f"Kitchen = {min_kitchen_sqft:.0f} sqft ⚠ (min {MIN_KITCHEN_SQFT:.0f} sqft — slightly small)"
        else:
            pts, status = 0, "fail"
            detail = f"Kitchen = {min_kitchen_sqft:.0f} sqft ❌ (min {MIN_KITCHEN_SQFT:.0f} sqft / 5.0 sqm required)"
    else:
        pts = round(w * 0.5)
        status = "warn"
        detail = "No kitchen detected"

    results.append({"rule": "Kitchen Minimum Area", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 7: Bathroom Minimum Area ─────────────────────────────────────────
    w = WEIGHTS["bathroom_area"]
    bathrooms = [r for r, t in typed if t == "bathroom"]
    if bathrooms:
        min_bath_sqft = min(r["width"] * r["height"] for r in bathrooms)
        if min_bath_sqft >= MIN_BATHROOM_SQFT:
            pts, status = w, "pass"
            detail = f"Bathroom = {min_bath_sqft:.0f} sqft ✅ (min {MIN_BATHROOM_SQFT:.0f} sqft / 2.8 sqm)"
        elif min_bath_sqft >= MIN_BATHROOM_SQFT * 0.7:
            pts = round(w * 0.5)
            status = "warn"
            detail = f"Bathroom = {min_bath_sqft:.0f} sqft ⚠ (min {MIN_BATHROOM_SQFT:.0f} sqft — small)"
        else:
            pts, status = 0, "fail"
            detail = f"Bathroom = {min_bath_sqft:.0f} sqft ❌ (min {MIN_BATHROOM_SQFT:.0f} sqft / 2.8 sqm required)"
    else:
        pts = round(w * 0.5)
        status = "warn"
        detail = "No bathroom detected"

    results.append({"rule": "Bathroom Minimum Area", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    # ── Rule 8: Corridor/Passage Width ────────────────────────────────────────
    w = WEIGHTS["corridor_width"]
    corridors = [r for r, t in typed if t == "corridor"]
    if corridors:
        min_corridor_w = min(min(r["width"], r["height"]) for r in corridors)
        min_corridor_m = min_corridor_w * FT_TO_M
        if min_corridor_w >= MIN_CORRIDOR_FT:
            pts, status = w, "pass"
            detail = f"Corridor width = {min_corridor_m:.1f} m ✅ (min 1.0 m)"
        elif min_corridor_w >= MIN_CORRIDOR_FT * 0.7:
            pts = round(w * 0.5)
            status = "warn"
            detail = f"Corridor width = {min_corridor_m:.1f} m ⚠ (min 1.0 m — narrow)"
        else:
            pts, status = 0, "fail"
            detail = f"Corridor width = {min_corridor_m:.1f} m ❌ (min 1.0 m required by NBC 2016)"
    else:
        pts = round(w * 0.5)
        status = "warn"
        detail = "No corridor/passage detected (open plan layout)"

    results.append({"rule": "Corridor / Passage Width", "status": status, "points": pts, "max": w, "detail": detail})
    total += pts

    score = min(total, 100)
    return {
        "score": score,
        "grade": (
            "Compliant" if score >= 85 else
            "Mostly Compliant" if score >= 65 else
            "Partially Compliant" if score >= 45 else
            "Non-Compliant"
        ),
        "rules": results,
    }
