"""
vastu_engine.py
Deterministic rule-based Vastu scoring engine.
Assigns rooms to compass zones, applies 10 weighted rules,
returns score/100 with a per-rule breakdown.
"""

# ── Zone grid ─────────────────────────────────────────────────────────────────
def get_zone_map(entry_dir: str) -> dict[tuple[int, int], str]:
    ed = entry_dir.strip().lower()
    if ed in ["east", "e"]:
        return {
            (0, 0): "NE", (1, 0): "E",  (2, 0): "SE",
            (0, 1): "N",  (1, 1): "C",  (2, 1): "S",
            (0, 2): "NW", (1, 2): "W",  (2, 2): "SW",
        }
    elif ed in ["south", "s"]:
        return {
            (0, 0): "SE", (1, 0): "S",  (2, 0): "SW",
            (0, 1): "E",  (1, 1): "C",  (2, 1): "W",
            (0, 2): "NE", (1, 2): "N",  (2, 2): "NW",
        }
    elif ed in ["west", "w"]:
        return {
            (0, 0): "SW", (1, 0): "W",  (2, 0): "NW",
            (0, 1): "S",  (1, 1): "C",  (2, 1): "N",
            (0, 2): "SE", (1, 2): "E",  (2, 2): "NE",
        }
    else: # north / default
        return {
            (0, 0): "NW", (1, 0): "N",  (2, 0): "NE",
            (0, 1): "W",  (1, 1): "C",  (2, 1): "E",
            (0, 2): "SW", (1, 2): "S",  (2, 2): "SE",
        }

WEIGHTS = {
    "entrance":    20,
    "kitchen":     15,
    "brahmasthan": 15,
    "bedroom":     10,
    "pooja":       10,
    "staircase":   10,
    "bathroom":    10,
    "balcony":      5,
    "water":        5,
}  # Total = 100

# ── Helpers ───────────────────────────────────────────────────────────────────

def _classify(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ["entrance", "foyer", "hall", "lobby"]):
        return "entrance"
    if "kitchen" in n:
        return "kitchen"
    if "master" in n or ("bedroom" in n and "1" in n):
        return "master_bedroom"
    if "bedroom" in n:
        return "bedroom"
    if any(k in n for k in ["pooja", "puja", "prayer"]):
        return "pooja"
    if "stair" in n:
        return "staircase"
    if any(k in n for k in ["bath", "toilet", "wc", "washroom"]):
        return "bathroom"
    if any(k in n for k in ["balcony", "terrace", "veranda"]):
        return "balcony"
    if any(k in n for k in ["water", "tank", "bore"]):
        return "water"
    if "living" in n or "lounge" in n:
        return "living"
    return "other"


def _zone(room: dict, plot_w: float, plot_h: float, entry_dir: str) -> str:
    cx = room["x"] + room["width"]  / 2
    cy = room["y"] + room["height"] / 2
    col = 0 if cx < plot_w / 3 else (1 if cx < 2 * plot_w / 3 else 2)
    row = 0 if cy < plot_h / 3 else (1 if cy < 2 * plot_h / 3 else 2)
    return get_zone_map(entry_dir)[(col, row)]


def _center_overlap(room: dict, plot_w: float, plot_h: float) -> bool:
    """True if room's centroid is inside the central 1/3 zone."""
    cx0, cx1 = plot_w / 3, 2 * plot_w / 3
    cy0, cy1 = plot_h / 3, 2 * plot_h / 3
    centroid_x = room["x"] + room["width"] / 2
    centroid_y = room["y"] + room["height"] / 2
    return (cx0 < centroid_x < cx1) and (cy0 < centroid_y < cy1)

# ── Main scoring function ─────────────────────────────────────────────────────

def score_vastu(rooms: list, plot_w: float, plot_h: float, entry_dir: str) -> dict:
    """
    Score a ground-floor room list against 10 Vastu rules.
    Returns {score, grade, rules: [{rule, status, points, max, detail}]}
    """
    ed = entry_dir.strip().lower()
    typed = [(r, _classify(r["name"]), _zone(r, plot_w, plot_h, entry_dir)) for r in rooms]
    results = []
    total = 0

    # ── Rule 1: Main Entrance Direction ──────────────────────────────────────
    w = WEIGHTS["entrance"]
    entry_pts = {
        "north": w, "northeast": w, "ne": w,
        "east": round(w * 0.90),
        "northwest": round(w * 0.55), "nw": round(w * 0.55),
        "west": round(w * 0.40),
        "south": round(w * 0.25), "southeast": round(w * 0.25), "se": round(w * 0.25),
        "southwest": 0, "sw": 0,
    }
    pts = entry_pts.get(ed, round(w * 0.50))
    status = "pass" if pts >= round(w * 0.75) else ("warn" if pts > 0 else "fail")
    desc = {"pass": "Excellent", "warn": "Acceptable", "fail": "Inauspicious — avoid Southwest"}[status]
    results.append({"rule": "Main Entrance Direction", "status": status, "points": pts, "max": w,
                    "detail": f"Entrance faces {ed.title()} — {desc}"})
    total += pts

    # ── Rule 2: Kitchen Placement ─────────────────────────────────────────────
    w = WEIGHTS["kitchen"]
    kitchens = [z for _, t, z in typed if t == "kitchen"]
    if kitchens:
        ks = {"SE": w, "NW": round(w*0.80), "W": round(w*0.75),
              "N": round(w*0.60), "S": round(w*0.60), "E": round(w*0.60),
              "SW": round(w*0.40), "C": round(w*0.10), "NE": 0}
        pts = min(ks.get(z, round(w*0.60)) for z in kitchens)
        z0 = kitchens[0]
        msg = "Ideal — Southeast" if z0 == "SE" else ("Good — Northwest" if z0 == "NW" else
              ("Avoid Northeast" if z0 == "NE" else "Acceptable"))
        status = "pass" if pts >= round(w*0.75) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = round(w*0.50), "warn", "Kitchen not detected"
    results.append({"rule": "Kitchen Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 3: Master Bedroom Placement ─────────────────────────────────────
    w = WEIGHTS["bedroom"]
    beds = [(r, z) for r, t, z in typed if t == "master_bedroom"]
    if not beds:
        beds = [(r, z) for r, t, z in typed if t == "bedroom"]
    if beds:
        bs = {"SW": w, "S": round(w*0.80), "W": round(w*0.65),
              "C": round(w*0.40), "E": round(w*0.25), "NW": round(w*0.25),
              "N": round(w*0.15), "SE": round(w*0.20), "NE": 0}
        pts = min(bs.get(z, round(w*0.30)) for _, z in beds)
        z0 = beds[0][1]
        msg = "Ideal — Southwest" if z0 == "SW" else ("Good" if pts >= round(w*0.5) else "Avoid Northeast")
        status = "pass" if pts >= round(w*0.65) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = 0, "warn", "No bedroom detected"
    results.append({"rule": "Master Bedroom Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 4: Pooja Room ────────────────────────────────────────────────────
    w = WEIGHTS["pooja"]
    poojas = [z for _, t, z in typed if t == "pooja"]
    if poojas:
        ps = {"NE": w, "N": round(w*0.80), "E": round(w*0.65),
              "NW": round(w*0.40), "W": round(w*0.25), "C": round(w*0.15),
              "SW": 0, "S": round(w*0.10), "SE": round(w*0.10)}
        pts = min(ps.get(z, round(w*0.25)) for z in poojas)
        msg = "Ideal — Northeast" if poojas[0] == "NE" else "Acceptable"
        status = "pass" if pts >= round(w*0.65) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = w, "pass", "No Pooja room (optional)"
    results.append({"rule": "Pooja Room Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 5: Staircase ─────────────────────────────────────────────────────
    w = WEIGHTS["staircase"]
    stairs = [z for _, t, z in typed if t == "staircase"]
    if stairs:
        ss = {"SW": w, "S": round(w*0.80), "W": round(w*0.65),
              "SE": round(w*0.50), "NW": round(w*0.30),
              "N": round(w*0.10), "E": round(w*0.10), "NE": 0, "C": 0}
        pts = min(ss.get(z, round(w*0.25)) for z in stairs)
        msg = "Ideal — SW/S/W" if pts >= round(w*0.65) else "Avoid Northeast or Center"
        status = "pass" if pts >= round(w*0.65) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = round(w*0.50), "warn", "No staircase (single-floor plan)"
    results.append({"rule": "Staircase Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 6: Bathroom/Toilet ───────────────────────────────────────────────
    w = WEIGHTS["bathroom"]
    baths = [(r, z) for r, t, z in typed if t == "bathroom"]
    if baths:
        bts = {"NW": w, "W": round(w*0.80), "S": round(w*0.65), "SW": round(w*0.50),
               "SE": round(w*0.50), "E": round(w*0.30), "N": round(w*0.15), "NE": 0, "C": 0}
        pts = int(sum(bts.get(z, round(w*0.30)) for _, z in baths) / len(baths))
        z0 = baths[0][1]
        msg = "Ideal — NW/W" if pts >= round(w*0.75) else f"Bathroom in {z0} — avoid NE or Center"
        status = "pass" if pts >= round(w*0.65) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = round(w*0.50), "warn", "No bathroom detected"
    results.append({"rule": "Bathroom/Toilet Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 7: Brahmasthan (center open) ────────────────────────────────────
    w = WEIGHTS["brahmasthan"]
    heavy_in_center = [r["name"] for r, t, z in typed
                       if _center_overlap(r, plot_w, plot_h) and t in ("bathroom", "kitchen")]
    
    exempt_center = ("staircase", "corridor", "foyer", "storage", "store room", "walk-in closet", "parking", "utility", "open area", "terrace")
    any_in_center = [r["name"] for r, t, z in typed if z == "C" and not any(k in r["name"].lower() for k in exempt_center) and t not in exempt_center]
    if heavy_in_center:
        pts, status = 0, "fail"
        msg = f"Heavy rooms in center: {', '.join(heavy_in_center)}"
    elif any_in_center:
        pts, status = round(w*0.60), "warn"
        msg = f"Center occupied by {', '.join(any_in_center)} — prefer open"
    else:
        pts, status, msg = w, "pass", "Center zone is open and uncluttered"
    results.append({"rule": "Brahmasthan (Center Free)", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 8: Balcony/Open Space ────────────────────────────────────────────
    w = WEIGHTS["balcony"]
    balconies = [z for _, t, z in typed if t == "balcony"]
    if balconies:
        bals = {"N": w, "E": w, "NE": w, "NW": round(w*0.60), "W": round(w*0.60),
                "S": round(w*0.20), "SE": round(w*0.20), "C": round(w*0.10), "SW": 0}
        pts = min(bals.get(z, round(w*0.40)) for z in balconies)
        msg = "Ideal — N/E/NE" if pts >= round(w*0.75) else "Avoid Southwest openings"
        status = "pass" if pts >= round(w*0.75) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = round(w*0.60), "warn", "No balcony detected"
    results.append({"rule": "Balcony Direction", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 9: Water Source ──────────────────────────────────────────────────
    w = WEIGHTS["water"]
    water = [z for _, t, z in typed if t == "water"]
    if water:
        ws = {"NE": w, "N": round(w*0.80), "E": round(w*0.60),
              "NW": round(w*0.40), "W": round(w*0.30), "C": round(w*0.20),
              "SE": round(w*0.20), "S": round(w*0.10), "SW": 0}
        pts = min(ws.get(z, round(w*0.30)) for z in water)
        msg = "Ideal — Northeast" if water[0] == "NE" else "Acceptable"
        status = "pass" if pts >= round(w*0.75) else ("warn" if pts > 0 else "fail")
    else:
        pts, status, msg = w, "pass", "No water room (optional)"
    results.append({"rule": "Water Source Placement", "status": status, "points": pts, "max": w, "detail": msg})
    total += pts

    # ── Rule 10: Living Room (advisory, no weight) ───────────────────────────
    living = [z for _, t, z in typed if t == "living"]
    if living:
        good = living[0] in ("N", "E", "NE", "NW")
        results.append({"rule": "Living Room Direction (Advisory)", "status": "pass" if good else "warn",
                        "points": 0, "max": 0,
                        "detail": f"Living Room in {living[0]} — {'Good (N/E/NE preferred)' if good else 'Preferred: North or East side'}"})

    score = min(total, 100)
    return {
        "score":   score,
        "grade":   "Excellent" if score >= 85 else ("Good" if score >= 65 else ("Fair" if score >= 45 else "Poor")),
        "rules":   results,
    }
