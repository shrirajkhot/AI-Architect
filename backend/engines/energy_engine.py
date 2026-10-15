"""
energy_engine.py
Evaluates thermal efficiency and sun path optimization for a floor plan.
"""


from engines.vastu_engine import get_zone_map

def _zone(room: dict, plot_w: float, plot_h: float, entry_dir: str) -> str:
    cx = room["x"] + room["width"]  / 2
    cy = room["y"] + room["height"] / 2
    col = 0 if cx < plot_w / 3 else (1 if cx < 2 * plot_w / 3 else 2)
    row = 0 if cy < plot_h / 3 else (1 if cy < 2 * plot_h / 3 else 2)
    return get_zone_map(entry_dir)[(col, row)]

def _classify(name: str) -> str:
    n = name.lower()
    if "kitchen" in n: return "kitchen"
    if "bed" in n: return "bedroom"
    if "living" in n or "lounge" in n: return "living"
    if "bath" in n or "toilet" in n or "wc" in n: return "bathroom"
    if "stair" in n: return "staircase"
    return "other"

def wall_to_compass(wall: str, entry_dir: str) -> str:
    ed = entry_dir.strip().lower()
    if ed in ["east", "e"]:
        mapping = {"top": "E", "bottom": "W", "left": "N", "right": "S"}
    elif ed in ["south", "s"]:
        mapping = {"top": "S", "bottom": "N", "left": "E", "right": "W"}
    elif ed in ["west", "w"]:
        mapping = {"top": "W", "bottom": "E", "left": "S", "right": "N"}
    else:
        mapping = {"top": "N", "bottom": "S", "left": "W", "right": "E"}
    return mapping.get(wall.lower(), "N")

def score_energy(rooms: list, plot_w: float, plot_h: float, entry_dir: str) -> dict:
    """
    Score a layout based on natural lighting and thermal efficiency.
    Returns {score, grade, rules: [{rule, status, points, max, detail}]}
    """
    results = []
    total = 0

    # Rule 1: Solar Gain (35 points)
    # Score west-facing glazing negatively, north-facing positively.
    north_windows = 0
    west_windows = 0
    for r in rooms:
        for w in r.get("windows", []):
            compass = wall_to_compass(w["wall"], entry_dir)
            if compass == "N": north_windows += 1
            elif compass == "W": west_windows += 1
            
    solar_score = min(35, max(0, 20 + (north_windows * 5) - (west_windows * 5)))
    if solar_score >= 30:
        s_status = "pass"
        s_detail = "Excellent solar gain control. North glazing provides diffuse light; West is protected."
    elif solar_score >= 20:
        s_status = "warn"
        s_detail = "Moderate solar gain. Consider reducing West-facing windows."
    else:
        s_status = "fail"
        s_detail = "High thermal load due to excessive West-facing glazing."
        
    results.append({"rule": "Solar Gain Optimization", "status": s_status, "points": solar_score, "max": 35, "detail": s_detail})
    total += solar_score

    # Rule 2: Cross-ventilation (35 points)
    # Score rooms that have openings on >= 2 different walls.
    well_ventilated_rooms = 0
    habitable = [r for r in rooms if _classify(r["name"]) in ["bedroom", "living", "kitchen"]]
    for r in habitable:
        walls_with_openings = set()
        for w in r.get("windows", []):
            walls_with_openings.add(w["wall"])
        for d in r.get("doors", []):
            walls_with_openings.add(d["wall"])
        if len(walls_with_openings) >= 2:
            well_ventilated_rooms += 1

    if not habitable:
        vent_score = 35
    else:
        ratio = well_ventilated_rooms / len(habitable)
        vent_score = int(35 * ratio)
        
    if vent_score >= 25:
        v_status = "pass"
        v_detail = f"Good cross-ventilation. {well_ventilated_rooms} of {len(habitable)} habitable rooms have multiple openings."
    elif vent_score >= 15:
        v_status = "warn"
        v_detail = f"Fair cross-ventilation. {well_ventilated_rooms} of {len(habitable)} habitable rooms have multiple openings."
    else:
        v_status = "fail"
        v_detail = "Poor cross-ventilation. Most habitable rooms only have openings on one side."
        
    results.append({"rule": "Natural Cross-Ventilation", "status": v_status, "points": vent_score, "max": 35, "detail": v_detail})
    total += vent_score

    # Rule 3: Thermal Buffering (30 points)
    # Score service rooms (bath, utility, stair) placed on the South or West envelope where they shield habitable rooms.
    typed = [(r, _classify(r["name"]), _zone(r, plot_w, plot_h, entry_dir)) for r in rooms]
    service_rooms = [z for _, t, z in typed if t in ["bathroom", "staircase", "other"]]
    sw_buffers = sum(1 for z in service_rooms if "S" in z or "W" in z)

    if sw_buffers >= 2:
        buffer_score = 30
        b_status = "pass"
        b_detail = "Excellent thermal buffering. Service rooms on South/West protect habitable spaces from afternoon heat."
    elif sw_buffers == 1:
        buffer_score = 15
        b_status = "warn"
        b_detail = "Partial thermal buffering. More service rooms could be placed on the South/West edges."
    else:
        buffer_score = 0
        b_status = "fail"
        b_detail = "Lack of thermal buffers. South/West walls expose habitable rooms to direct heat."

    results.append({"rule": "Envelope Thermal Buffering", "status": b_status, "points": buffer_score, "max": 30, "detail": b_detail})
    total += buffer_score

    return {
        "score": total,
        "grade": "A" if total >= 70 else "B" if total >= 50 else "C",
        "rules": results
    }
