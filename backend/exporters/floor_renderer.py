"""
floor_renderer.py
Renders a JSON room layout as a professional 2D floor plan PNG using Pillow.
Derived from the SAME JSON as the SVG blueprint → perfect match guaranteed.
"""

import io
from PIL import Image, ImageDraw, ImageFont

# ── Visual constants ──────────────────────────────────────────────────────────
SCALE       = 30        # pixels per foot
PADDING     = 80        # canvas margin in px
WALL_PX     = 4         # interior wall thickness
OUTER_PX    = 7         # outer building wall thickness
TARGET_W    = 960       # target canvas width (height adapts)

BG          = (251, 252, 253)
GRID_MINOR  = (230, 237, 243)
GRID_MAJOR  = (205, 216, 228)
WALL_CLR    = (18, 22, 32)
OUTER_CLR   = (8,  10, 18)
DIM_CLR     = (85, 105, 130)
TEXT_CLR    = (18, 22, 32)
SUB_CLR     = (90, 108, 128)
DOOR_CLR    = (55, 90, 140)
WIN_CLR     = (35, 65, 110)    # Darkened from (70,130,180)

ROOM_FILLS = {
    "master":   (210, 228, 252),
    "bedroom":  (220, 234, 252),
    "bathroom": (204, 240, 246),
    "toilet":   (204, 240, 246),
    "wc":       (204, 240, 246),
    "kitchen":  (255, 237, 208),
    "living":   (232, 222, 252),
    "lounge":   (232, 222, 252),
    "dining":   (252, 218, 236),
    "balcony":  (208, 248, 226),
    "terrace":  (208, 248, 226),
    "hall":     (252, 244, 210),
    "lobby":    (252, 244, 210),
    "entrance": (252, 244, 210),
    "foyer":    (252, 244, 210),
    "parking":  (230, 230, 234),
    "garage":   (230, 230, 234),
    "store":    (236, 236, 240),
    "utility":  (236, 236, 240),
    "default":  (240, 242, 246),
}

def _room_fill(name: str) -> tuple:
    n = name.lower()
    for key, clr in ROOM_FILLS.items():
        if key in n:
            return clr
    return ROOM_FILLS["default"]

def _font(size: int, bold: bool = False):
    """Load Arial from Windows Fonts; fall back to Pillow default."""
    paths = [
        (r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
        (r"C:\Windows\Fonts\Arial Bold.ttf" if bold else r"C:\Windows\Fonts\Arial.ttf"),
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()

def _center_text(draw, text, cx, cy, font, color):
    try:
        bb = draw.textbbox((0, 0), text, font=font)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        draw.text((cx - w // 2, cy - h // 2), text, fill=color, font=font)
    except Exception:
        draw.text((cx, cy), text, fill=color, font=font)

# ── Public API ────────────────────────────────────────────────────────────────

def render_floor_plan(rooms: list, unit_label: str = "Architectural Plan", plot_w: float | None = None, plot_h: float | None = None, entry_dir: str = "north") -> bytes:
    """Generates a professional 2D floor plan PNG."""
    if not rooms and not plot_w:
        raise ValueError("No rooms or plot boundaries to render")

    # Bounding box
    if plot_w is not None and plot_h is not None:
        min_x, min_y = 0.0, 0.0
        max_x, max_y = float(plot_w), float(plot_h)
    else:
        xs = [r["x"] for r in rooms] + [r["x"] + r["width"]  for r in rooms]
        ys = [r["y"] for r in rooms] + [r["y"] + r["height"] for r in rooms]
        min_x, min_y = min(xs), min(ys)
        max_x, max_y = max(xs), max(ys)
    
    plan_w, plan_h = max_x - min_x, max_y - min_y

    # Auto-scale to fit TARGET_W
    scale = min(SCALE, (TARGET_W - 2 * PADDING) / max(plan_w, plan_h, 1))
    scale = max(scale, 14)

    cw = int(plan_w * scale) + 2 * PADDING
    ch = int(plan_h * scale) + 2 * PADDING + 70   # +70 for title block

    # Coordinate helpers (Y flipped so Y=0 is at bottom like architectural drawings)
    def px(x_ft): return int((x_ft - min_x) * scale) + PADDING
    def py(y_ft): return int((y_ft - min_y) * scale) + PADDING   # NO flip — matches SVG
    def pl(l_ft): return max(1, int(l_ft * scale))

    img  = Image.new("RGB", (cw, ch), BG)
    draw = ImageDraw.Draw(img)

    # ── Grid ──────────────────────────────────────────────────────────────────
    for gx in range(int(min_x), int(max_x) + 2):
        c = GRID_MAJOR if gx % 5 == 0 else GRID_MINOR
        draw.line([(px(gx), PADDING), (px(gx), ch - PADDING - 70)], fill=c, width=1)
    for gy in range(int(min_y), int(max_y) + 2):
        c = GRID_MAJOR if gy % 5 == 0 else GRID_MINOR
        draw.line([(PADDING, py(gy)), (cw - PADDING, py(gy))], fill=c, width=1)

    # ── Outer building wall ───────────────────────────────────────────────────
    bx0, by0 = px(min_x), py(min_y)   # top-left
    bx1, by1 = px(max_x), py(max_y)   # bottom-right
    draw.rectangle([bx0 - 3, by0 - 3, bx1 + 3, by1 + 3],
                   outline=OUTER_CLR, width=OUTER_PX)

    # ── Rooms ─────────────────────────────────────────────────────────────────
    drawn_doors = set()
    for room in rooms:
        rx0 = px(room["x"])
        ry0 = py(room["y"])                    # top of room in pixels (no flip)
        rx1 = px(room["x"] + room["width"])
        ry1 = py(room["y"] + room["height"])   # bottom of room in pixels
        rw, rh = rx1 - rx0, ry1 - ry0
        cx_px, cy_px = (rx0 + rx1) // 2, (ry0 + ry1) // 2

        fill = _room_fill(room["name"])

        # Fill + wall outline
        draw.rectangle([rx0, ry0, rx1, ry1], fill=fill)
        draw.rectangle([rx0, ry0, rx1, ry1], outline=WALL_CLR, width=WALL_PX)

        # ── Doors ─────────────────────────────────────────────────────────
        for door in room.get("doors", []):
            d_wall = door.get("wall", "right")
            ft_pos = room["x"] + door.get("position", 0) if d_wall in ["top", "bottom"] else room["y"] + door.get("position", 0)
            d_pos  = px(ft_pos) if d_wall in ["top", "bottom"] else py(ft_pos)
            door_w_ft = door.get("width", 3)
            d_w    = pl(door_w_ft)
            if d_w < pl(1.5): continue
            
            hx = d_pos if d_wall in ["top", "bottom"] else (rx0 if d_wall == "left" else rx1)
            hy = ry0 if d_wall == "top" else (ry1 if d_wall == "bottom" else d_pos)
            key = (hx, hy)
            is_drawn = key in drawn_doors
            drawn_doors.add(key)
            
            # Check if this door touches a stair room
            ft_hx = ft_pos if d_wall in ["top", "bottom"] else (room["x"] if d_wall == "left" else room["x"] + room["width"])
            ft_hy = room["y"] if d_wall == "top" else (room["y"] + room["height"] if d_wall == "bottom" else ft_pos)
            is_stair = any(
                "stair" in r["name"].lower() and
                (r["x"] - 0.1 <= ft_hx <= r["x"] + r["width"] + 0.1) and
                (r["y"] - 0.1 <= ft_hy <= r["y"] + r["height"] + 0.1)
                for r in rooms
            )

            try:
                if d_wall == "top":
                    draw.line([(d_pos, ry0), (d_pos + d_w, ry0)], fill=fill, width=WALL_PX + 2)
                    if not is_drawn and not is_stair:
                        draw.line([(d_pos, ry0), (d_pos, ry0 + d_w)], fill=DOOR_CLR, width=1)
                        draw.arc([d_pos - d_w, ry0 - d_w, d_pos + d_w, ry0 + d_w], 0, 90, fill=DOOR_CLR, width=1)
                elif d_wall == "bottom":
                    draw.line([(d_pos, ry1), (d_pos + d_w, ry1)], fill=fill, width=WALL_PX + 2)
                    if not is_drawn and not is_stair:
                        draw.line([(d_pos, ry1), (d_pos, ry1 - d_w)], fill=DOOR_CLR, width=1)
                        draw.arc([d_pos - d_w, ry1 - d_w, d_pos + d_w, ry1 + d_w], 270, 360, fill=DOOR_CLR, width=1)
                elif d_wall == "left":
                    draw.line([(rx0, d_pos), (rx0, d_pos + d_w)], fill=fill, width=WALL_PX + 2)
                    if not is_drawn and not is_stair:
                        draw.line([(rx0, d_pos), (rx0 + d_w, d_pos)], fill=DOOR_CLR, width=1)
                        draw.arc([rx0 - d_w, d_pos - d_w, rx0 + d_w, d_pos + d_w], 0, 90, fill=DOOR_CLR, width=1)
                elif d_wall == "right":
                    draw.line([(rx1, d_pos), (rx1, d_pos + d_w)], fill=fill, width=WALL_PX + 2)
                    if not is_drawn and not is_stair:
                        draw.line([(rx1, d_pos), (rx1 - d_w, d_pos)], fill=DOOR_CLR, width=1)
                        draw.arc([rx1 - d_w, d_pos - d_w, rx1 + d_w, d_pos + d_w], 90, 180, fill=DOOR_CLR, width=1)
            except Exception:
                pass

        # ── Window marks — data-driven from room["windows"] ───────────────
        for win in room.get("windows", []):
            wall    = win.get("wall", "")
            w_pos   = win.get("position", 0)
            w_width = win.get("width", 3)
            gap_px  = 3    # pixels between the two parallel lines

            if wall == "top":
                wx1 = px(room["x"] + w_pos)
                wx2 = px(room["x"] + w_pos + w_width)
                wy  = ry0
                draw.line([(wx1, wy), (wx2, wy)], fill=WIN_CLR, width=2)
                draw.line([(wx1, wy - gap_px), (wx2, wy - gap_px)], fill=WIN_CLR, width=1)
                draw.line([((wx1+wx2)//2, wy), ((wx1+wx2)//2, wy - gap_px)], fill=WIN_CLR, width=1)
                draw.line([(wx1, wy - gap_px//2), (wx2, wy - gap_px//2)], fill=WIN_CLR, width=1)
                for tx in [wx1, wx2]:
                    draw.line([(tx, wy - 5), (tx, wy + 3)], fill=WIN_CLR, width=1)
            elif wall == "bottom":
                wx1 = px(room["x"] + w_pos)
                wx2 = px(room["x"] + w_pos + w_width)
                wy  = ry1
                draw.line([(wx1, wy), (wx2, wy)], fill=WIN_CLR, width=2)
                draw.line([(wx1, wy + gap_px), (wx2, wy + gap_px)], fill=WIN_CLR, width=1)
                draw.line([((wx1+wx2)//2, wy), ((wx1+wx2)//2, wy + gap_px)], fill=WIN_CLR, width=1)
                draw.line([(wx1, wy + gap_px//2), (wx2, wy + gap_px//2)], fill=WIN_CLR, width=1)
                for tx in [wx1, wx2]:
                    draw.line([(tx, wy - 3), (tx, wy + 5)], fill=WIN_CLR, width=1)
            elif wall == "left":
                wy1 = py(room["y"] + w_pos)
                wy2 = py(room["y"] + w_pos + w_width)
                wx  = rx0
                draw.line([(wx, wy1), (wx, wy2)], fill=WIN_CLR, width=2)
                draw.line([(wx - gap_px, wy1), (wx - gap_px, wy2)], fill=WIN_CLR, width=1)
                draw.line([(wx, (wy1+wy2)//2), (wx - gap_px, (wy1+wy2)//2)], fill=WIN_CLR, width=1)
                draw.line([(wx - gap_px//2, wy1), (wx - gap_px//2, wy2)], fill=WIN_CLR, width=1)
                for ty in [wy1, wy2]:
                    draw.line([(wx - 5, ty), (wx + 3, ty)], fill=WIN_CLR, width=1)
            elif wall == "right":
                wy1 = py(room["y"] + w_pos)
                wy2 = py(room["y"] + w_pos + w_width)
                wx  = rx1
                draw.line([(wx, wy1), (wx, wy2)], fill=WIN_CLR, width=2)
                draw.line([(wx + gap_px, wy1), (wx + gap_px, wy2)], fill=WIN_CLR, width=1)
                draw.line([(wx, (wy1+wy2)//2), (wx + gap_px, (wy1+wy2)//2)], fill=WIN_CLR, width=1)
                draw.line([(wx + gap_px//2, wy1), (wx + gap_px//2, wy2)], fill=WIN_CLR, width=1)
                for ty in [wy1, wy2]:
                    draw.line([(wx - 3, ty), (wx + 5, ty)], fill=WIN_CLR, width=1)

        # ── Furniture ─────────────────────────────────────────────────────
        for furn in room.get("furniture", []):
            try:
                fx0 = rx0 + int(furn["x"] * scale)
                fy0 = ry0 + int(furn["y"] * scale)
                fx1 = rx0 + int((furn["x"] + furn["width"]) * scale)
                fy1 = ry0 + int((furn["y"] + furn["height"]) * scale)
                # clamp to room bounds
                fx0, fy0 = max(fx0, rx0 + 2), max(fy0, ry0 + 2)
                fx1, fy1 = min(fx1, rx1 - 2), min(fy1, ry1 - 2)
                if fx1 <= fx0 or fy1 <= fy0:
                    continue
                # semi-transparent fill using a blended colour
                f_fill = tuple(int(c * 0.82 + 255 * 0.18) for c in fill)
                draw.rectangle([fx0, fy0, fx1, fy1], fill=f_fill, outline=(140, 160, 185), width=1)
                # tiny label
                fcx, fcy = (fx0 + fx1) // 2, (fy0 + fy1) // 2
                fw_px, fh_px = fx1 - fx0, fy1 - fy0
                if fw_px > pl(2) and fh_px > pl(1.5):
                    fname = furn.get("name", "")
                    ff = _font(max(7, min(int(min(fw_px, fh_px) * 0.18), 10)))
                    _center_text(draw, fname, fcx, fcy, ff, (80, 100, 130))
            except Exception:
                pass
                
        # ── Labels (Drawn last to stay above furniture) ───────────────────
        nf_size = max(11, min(int(min(rw, rh) * 0.14), 17))
        df_size = max(8,  nf_size - 3)
        sqft    = round(room["width"] * room["height"])
        dim_str = f"{room['width']}' \u00d7 {room['height']}' ({sqft} sqft)"

        nf = _font(nf_size, bold=True)
        df = _font(df_size)
        _center_text(draw, room["name"], cx_px, cy_px - nf_size,     nf, TEXT_CLR)
        _center_text(draw, dim_str,      cx_px, cy_px + df_size // 2, df, SUB_CLR)

        # ── Width dimension line ───────────────────────────────────────────
        if rw > pl(6):
            dim_y = ry0 - 18
            draw.line([(rx0, dim_y), (rx1, dim_y)], fill=DIM_CLR, width=1)
            draw.line([(rx0, dim_y - 5), (rx0, dim_y + 5)], fill=DIM_CLR, width=1)
            draw.line([(rx1, dim_y - 5), (rx1, dim_y + 5)], fill=DIM_CLR, width=1)
            _center_text(draw, f"{room['width']} ft",
                         cx_px, dim_y - 10, _font(8), DIM_CLR)

    # ── Scale bar ─────────────────────────────────────────────────────────────
    sb_x, sb_y = PADDING, ch - PADDING + 18
    sb_len = pl(10)
    draw.line([(sb_x, sb_y), (sb_x + sb_len, sb_y)], fill=DIM_CLR, width=2)
    for tx in [sb_x, sb_x + sb_len // 2, sb_x + sb_len]:
        draw.line([(tx, sb_y - 5), (tx, sb_y + 5)], fill=DIM_CLR, width=1)
    _center_text(draw, "0", sb_x, sb_y + 12, _font(9), DIM_CLR)
    _center_text(draw, "5 ft", sb_x + sb_len // 2, sb_y + 12, _font(9), DIM_CLR)
    _center_text(draw, "10 ft", sb_x + sb_len, sb_y + 12, _font(9), DIM_CLR)

    # ── North arrow ───────────────────────────────────────────────────────────
    na_cx, na_cy, r = cw - PADDING + 30, PADDING - 20, 18
    draw.ellipse([na_cx - r, na_cy - r, na_cx + r, na_cy + r],
                 outline=DIM_CLR, width=1, fill=(245, 246, 248))
                 
    ed = entry_dir.strip().lower()
    if ed in ["east", "e"]: angle = -90
    elif ed in ["south", "s"]: angle = 180
    elif ed in ["west", "w"]: angle = 90
    else: angle = 0
    
    import math
    def rot(pts):
        rad = math.radians(angle)
        res = []
        for (x, y) in pts:
            dx, dy = x - na_cx, y - na_cy
            res.append((na_cx + dx * math.cos(rad) - dy * math.sin(rad),
                        na_cy + dx * math.sin(rad) + dy * math.cos(rad)))
        return res

    # Filled north half
    pts_n = [(na_cx, na_cy - r + 2), (na_cx - 6, na_cy + 4), (na_cx + 6, na_cy + 4)]
    draw.polygon(rot(pts_n), fill=WALL_CLR)
    # Open south half
    pts_s = [(na_cx, na_cy + r - 2), (na_cx - 6, na_cy - 4), (na_cx + 6, na_cy - 4)]
    draw.polygon(rot(pts_s), fill=(200, 205, 215))
    
    n_pos = rot([(na_cx, na_cy - r - 10)])[0]
    _center_text(draw, "N", n_pos[0], n_pos[1], _font(11, bold=True), WALL_CLR)

    # ── Title block ───────────────────────────────────────────────────────────
    tb_y = ch - 65
    draw.line([(PADDING, tb_y), (cw - PADDING, tb_y)], fill=DIM_CLR, width=1)
    draw.line([(PADDING, tb_y + 40), (cw - PADDING, tb_y + 40)], fill=DIM_CLR, width=1)
    draw.text((PADDING, tb_y + 6), "AI ARCHITECT",
              fill=WALL_CLR, font=_font(14, bold=True))
    draw.text((PADDING + 130, tb_y + 9), "GENERATED FLOOR PLAN",
              fill=DIM_CLR, font=_font(10))
    draw.text((PADDING, tb_y + 24),
              f"{unit_label}  |  {len(rooms)} rooms  |  Scale 1:50  |  All dims in feet",
              fill=DIM_CLR, font=_font(9))

    buf = io.BytesIO()
    img.save(buf, format="PNG", dpi=(150, 150))
    buf.seek(0)
    return buf.read()
