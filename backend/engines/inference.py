"""
inference.py
============
Phase 1 — Architect-Drafter Hybrid Model

LLM Fallback Chain (tried in order):
  1. gemini-3.1-pro-preview    (Google AI Studio — advanced intelligence, complex problem-solving fallback)
  2. deepseek-ai/DeepSeek-V3-0324 (Hugging Face router — large open-weight fallback)
  3. gemini-3.8-flash          (Google AI Studio — most intelligent Flash model, recommended primary)
  4. qwen/qwen3.8-27b          (Groq — fastest open-weight fallback)
  5. gemini-3.5-flash-lite     (Google AI Studio — fastest and most budget-friendly fallback)

The LLM ONLY produces topology/zoning JSON — never raw x,y,w,h coordinates.
The Python Drafter (architectural_layout.py) turns topology into exact coordinates.
"""

from __future__ import annotations
import os
import re
from typing import Optional, List, Dict, Tuple, Any
from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError
import json_repair
from engines.architectural_layout import build_layout_from_topology, inject_furniture, default_topology
from engines.layout_validator import boundary_check_only

from openai import OpenAI

# ── API key loading ───────────────────────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")
HF_API_KEY     = os.getenv("HF_API_KEY")

if not any([GOOGLE_API_KEY, GROQ_API_KEY, HF_API_KEY]):
    raise ValueError(
        "No LLM API Key (GOOGLE, GEMINI, GROQ, or HF) is found. "
        "Please add at least one to backend/.env"
    )

# ── Provider clients ──────────────────────────────────────────────────────────
_google_client: Optional[genai.Client] = None
if GOOGLE_API_KEY:
    _google_client = genai.Client(api_key=GOOGLE_API_KEY)

_groq_client: Optional[OpenAI] = None
if GROQ_API_KEY:
    _groq_client = OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )

_hf_client: Optional[OpenAI] = None
if HF_API_KEY:
    _hf_client = OpenAI(
        api_key=HF_API_KEY,
        base_url="https://router.huggingface.co/v1",
    )

# ── Fallback chain ────────────────────────────────────────────────────────────
FALLBACK_MODELS: list[dict] = []

if _google_client:
    FALLBACK_MODELS.append({
        "provider": "google",
        "model": "gemini-3.1-pro-preview",
        "client": _google_client,
    })

if _hf_client:
    FALLBACK_MODELS.append({
        "provider": "hf",
        "model": "deepseek-ai/DeepSeek-V3-0324",
        "client": _hf_client,
    })

if _google_client:
    FALLBACK_MODELS.append({
        "provider": "google",
        "model": "gemini-3.8-flash",
        "client": _google_client,
    })

if _groq_client:
    FALLBACK_MODELS.append({
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
        "client": _groq_client,
    })

if _google_client:
    FALLBACK_MODELS.append({
        "provider": "google",
        "model": "gemini-3.5-flash-lite",
        "client": _google_client,
    })


# ── Phase 1: Topology Pydantic Schema ────────────────────────────────────────

class LeftBayTopology(BaseModel):
    rooms: list[str]
    bathrooms_allocated: int = 0

class RightBayTopology(BaseModel):
    rooms: list[str]

class SpineTopology(BaseModel):
    rooms: list[str]

class TopologyBody(BaseModel):
    left_bay: LeftBayTopology
    right_bay: RightBayTopology
    spine: SpineTopology

class TopologyResponse(BaseModel):
    topology: TopologyBody
    design_rationale: str = ""


# ── LLM prompt ───────────────────────────────────────────────────────────────

_ARCHITECT_SYSTEM = """You are an advanced Architectural Layout Generation Engine. Your objective is to produce standardized, modernized, and structurally sound 2D floor plan layouts. You must strictly adhere to the following spatial, positional, and topological constraints across all generation scenarios. 

[1. GLOBAL ADJACENCY & POSITIONING RULES]
- BATHROOM PRIVACY: A bathroom door MUST NEVER open directly into a Living Room, Dining Room, or Kitchen. It must open into a hallway, vestibule, or function as an en-suite inside a bedroom.
- WET ZONE CLUSTERING: Kitchens, bathrooms, and utility areas MUST share common plumbing walls vertically (across floors) and horizontally to optimize shafts.
- FENESTRATION (LIGHT/AIR): Every Living Room, Bedroom, and Kitchen MUST have at least one exterior wall for windows. Internal bathrooms must connect to an internal ventilation shaft.
- CIRCULATION: Hallways and corridors must not exceed 15% of the total floor area. Rooms must not be placed in a linear sequence that requires walking through one private room to reach another.
- BALCONY PLACEMENT: Balconies MUST NEVER be attached to or share a boundary with a Staircase. They must ONLY be attached to a Bedroom, Living Room, or Family Lounge.

[2. SCENARIO 1: GROUND FLOOR (FLOOR 1) - ACTIVE / PUBLIC ZONE]
- MAIN ENTRANCE: Must act as the layout anchor, leading directly into a Foyer or the Living Room.
- LIVING ROOM: Must be located at the front of the house. It must be the largest room on this floor.
- DINING ROOM: Must act as a spatial buffer, sharing a direct boundary with both the Living Room and the Kitchen.
- KITCHEN: Must be adjacent to the Dining Room. Must have a secondary rear/side exit to a utility area.
- BEDROOMS: Maximum of ONE bedroom on this floor (Guest Bedroom or Elderly Room).
- BATHROOMS: One Powder Room (half-bath) accessible from the common area, plus one en-suite for the guest bedroom.
- STAIRCASE: Must be accessible from the common areas (Foyer/Living/Dining), never hidden inside a private room.

[3. SCENARIO 2: FIRST FLOOR (FLOOR 2) - PRIVATE / FAMILY ZONE]
- MASTER BEDROOM: Must be the largest room on this floor. Must be placed in the most private zone (rear or deep corner). MUST include an en-suite bathroom and walk-in closet space.
- SECONDARY BEDROOMS: Kids or guest rooms. Must have access to a shared bathroom on the same floor or individual en-suites.
- FAMILY LOUNGE: A secondary, smaller living area at the center of the floor, connecting the bedrooms and the staircase landing.
- BALCONIES: The Master Bedroom and the Family Lounge MUST have access to exterior balconies.
- STACKING: The Master Bedroom must stack directly over the Ground Floor Living Room or Ground Floor Bedroom to align load-bearing structural walls.

[4. SCENARIO 3: SECOND FLOOR (FLOOR 3) / TERRACE LEVEL - LEISURE ZONE]
- OPEN SPACE: Minimum 50% of this floor must be an open, unroofed Terrace.
- BUILT SPACES: Can include a Home Office, Gym, Home Theater, or Maid's Quarters.
- ACCESS: Maid's Quarters (if present) must have a separate, dedicated external staircase access if possible.

[5. SCENARIO 4: DUPLEX HOUSE (SPECIFIC MODIFICATIONS)]
- DOUBLE-HEIGHT SPACE: Must feature a double-height ceiling (cutout) over the Ground Floor Living or Dining area, providing a visual connection to the First Floor.
- INTERNAL STAIRCASE: Must be a central architectural feature (U-shaped or L-shaped) located in the main living space, connecting the Ground Floor directly to the First Floor Family Lounge.

[6. SCENARIO 5: MULTI-STORY APARTMENT BUILDING]
- CORE PLACEMENT: Elevators, fire stairs, and MEP shafts MUST be clustered in a central core.
- UNIT DISTRIBUTION: Individual apartment units radiate outward from the core. 
- UNIT WALLS: Every unit MUST have at least two exterior-facing walls to allow for cross-ventilation.

[EXECUTION DIRECTIVE]
When generating topology, you must validate your output against every rule in the active scenario before finalizing the response. If a rule is violated, recalculate the room positioning.
IMPORTANT: You DO NOT output spatial coordinates (x, y, w, h). You ONLY output structural intent (topology) as a valid JSON object — no markdown, no backticks, no explanations.
"""

def _build_architect_prompt(
    length: float, width: float,
    bedrooms: int, bathrooms: int,
    duplex: int, balcony: int, terrace: int, lift: int,
    vastu: int, entry_dir: str,
) -> str:
    extras = []
    if duplex:  extras.append("duplex stairs required")
    if balcony: extras.append(f"{balcony} balcony/balconies")
    if terrace: extras.append("rooftop terrace")
    if lift:    extras.append("lift/elevator")
    extras_str = (", ".join(extras)) if extras else "none"

    vastu_str = "Strict Vastu Shastra compliance required." if vastu else "Modern layout preferred."

    if vastu:
        ed = entry_dir.strip().lower()
        if ed in ["east", "e"]:
            k_bay, k_pos = "RIGHT BAY", "FRONT (first item)"
            m_bay, m_pos = "RIGHT BAY", "REAR (last item)"
            pooja_rule = "Pooja room MUST go in the LEFT BAY at the FRONT (North-East)."
        elif ed in ["south", "s"]:
            k_bay, k_pos = "LEFT BAY", "FRONT (first item)"
            m_bay, m_pos = "RIGHT BAY", "FRONT (first item)"
            pooja_rule = "Pooja room MUST go in the LEFT BAY at the REAR (North-East)."
        elif ed in ["west", "w"]:
            k_bay, k_pos = "LEFT BAY", "REAR (last item)"
            m_bay, m_pos = "LEFT BAY", "FRONT (first item)"
            pooja_rule = "Pooja room MUST go in the RIGHT BAY at the REAR (North-East)."
        else: # North
            k_bay, k_pos = "RIGHT BAY", "REAR (last item)"
            m_bay, m_pos = "LEFT BAY", "REAR (last item)"
            pooja_rule = "Pooja room MUST go in the RIGHT BAY at the FRONT (North-East)."
            
    if vastu:
        kitchen_rule = f"VASTU OVERRIDE — Kitchen MUST go in the {k_bay} at the {k_pos} (South-East). Do not place Kitchen in North-East."
        bedroom_rule = f"VASTU OVERRIDE — Master Bedroom MUST go in the {m_bay} at the {m_pos} (South-West) on upper floors. {pooja_rule} Avoid placing any bedroom in the North-East."
        balcony_rule = (
            "VASTU OVERRIDE — Balcony/open spaces MUST face North or East. \n"
            "VASTU OVERRIDE — BRAHMASTHAN: The center of the house (Spine middle) MUST remain open. Never place a Bathroom or Kitchen in the Spine or center.\n"
            "VASTU OVERRIDE — BATHROOMS: Avoid placing Bathrooms in the North-East.\n"
            "VASTU OVERRIDE — STAIRCASE: Staircase MUST be placed in the South, West, or South-West zone (usually the Left Bay or Right Bay). DO NOT place the Staircase in the Spine/Center or North-East."
        )
        spine_rule = "Upper Floors: Left Bay and Right Bay hold Bedrooms + Bathrooms. Spine holds Corridor."
    else:
        kitchen_rule = "Left Bay ground floor holds Parking + Kitchen (private/service zone). Right Bay holds Living Room + Dining Room (public zone)."
        bedroom_rule = "Upper floor bedrooms distributed evenly between Left Bay and Right Bay."
        balcony_rule = ""
        spine_rule = "Upper Floors: Left Bay and Right Bay hold Bedrooms with their attached Bathrooms. Spine holds Corridor + Staircase."

    return f"""
You are the Lead AI Architect. Design the optimal zoning topology for a floor plan.

# Input Constraints
- Plot: {length} ft wide x {width} ft deep
- Bedrooms: {bedrooms}
- Bathrooms: {bathrooms} (each bedroom should ideally have an en-suite bathroom)
- Entry direction: {entry_dir}
- Vastu: {vastu_str}
- Extras: {extras_str}

# Rules
1. The building is divided into 3 vertical bays: Left Bay (left ~35%), Spine (central corridor/stair, ~20%), Right Bay (right ~45%).
2. {kitchen_rule}
3. {spine_rule}
4. {bedroom_rule}
5. {balcony_rule if balcony_rule else "No specific balcony placement required."}
6. bathrooms_allocated = how many of the {bathrooms} bathrooms go to that bay's bedrooms. The total across both bays must equal {bathrooms}.
7. "rooms" in each bay should list high-level room types in top-to-bottom order (e.g. ["Master Bedroom", "Bedroom 2"]).

# Output Schema (respond with ONLY this JSON, no wrapping):
{{
  "topology": {{
    "left_bay": {{
      "rooms": ["Master Bedroom", "Bedroom 2"],
      "bathrooms_allocated": 2
    }},
    "right_bay": {{
      "rooms": ["Living Room", "Dining Room", "Kitchen"]
    }},
    "spine": {{
      "rooms": ["Foyer", "Corridor", "Staircase"]
    }}
  }},
  "design_rationale": "One-sentence explanation of zoning choices."
}}
"""


# ── LLM call + validation ─────────────────────────────────────────────────────

def _clean_llm_raw(raw: str) -> str:
    """Strip DeepSeek <think> blocks and markdown fences from LLM output."""
    # Strip <think>...</think> reasoning blocks (DeepSeek-R1 style)
    if "<think>" in raw:
        if "</think>" in raw:
            raw = raw[raw.rfind("</think>") + 8:].strip()
        else:
            # If the output was truncated and missing </think>, we can't reliably extract JSON.
            # However, we can try to find the last occurrence of '```json' or '{' just in case.
            pass
    # Strip ```json ... ``` markdown fences
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    return raw


# Topology JSON schema passed to Google's responseSchema for strict enforcement
_TOPOLOGY_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "topology": {
            "type": "object",
            "properties": {
                "left_bay": {
                    "type": "object",
                    "properties": {
                        "rooms": {"type": "array", "items": {"type": "string"}},
                        "bathrooms_allocated": {"type": "integer"},
                    },
                    "required": ["rooms", "bathrooms_allocated"],
                },
                "right_bay": {
                    "type": "object",
                    "properties": {
                        "rooms": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["rooms"],
                },
                "spine": {
                    "type": "object",
                    "properties": {
                        "rooms": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["rooms"],
                },
            },
            "required": ["left_bay", "right_bay", "spine"],
        },
        "design_rationale": {"type": "string"},
    },
    "required": ["topology", "design_rationale"],
}


def _call_architect_llm(prompt: str, retries: int = 2) -> Optional[TopologyResponse]:
    """
    Walk the FALLBACK_MODELS chain until a valid TopologyResponse is returned.

    Provider dispatch:
      - groq   : OpenAI-compatible client, JSON mode via response_format
      - google : google-genai SDK, response_mime_type + responseSchema
      - hf     : OpenAI-compatible client pointed at HF router, JSON mode

    On any API-level error (429, 500, timeout) the model is skipped immediately
    without retrying, to protect free-tier quotas on Google.
    """
    temperature = 0.4

    for idx, model_cfg in enumerate(FALLBACK_MODELS):
        provider   = model_cfg["provider"]
        model_name = model_cfg["model"]
        client: Any = model_cfg["client"]

        print(f"[architect] Trying #{idx + 1}: {provider}/{model_name}")

        raw: str = ""
        try:
            # ── Groq (OpenAI-compatible, JSON mode) ───────────────────────────
            if provider == "groq":
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": _ARCHITECT_SYSTEM},
                        {"role": "user",   "content": prompt},
                    ],
                    temperature=temperature,
                    response_format={"type": "json_object"},
                )
                raw = (response.choices[0].message.content or "").strip()

            # ── Google AI Studio (strict JSON schema enforcement) ──────────────
            elif provider == "google":
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=_ARCHITECT_SYSTEM,
                        response_mime_type="application/json",
                        response_schema=_TOPOLOGY_RESPONSE_SCHEMA,
                        temperature=temperature,
                    ),
                )
                raw = (response.text or "").strip()

            # ── Hugging Face router (OpenAI-compatible, JSON mode) ─────────────
            elif provider == "hf":
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": _ARCHITECT_SYSTEM},
                        {"role": "user",   "content": prompt},
                    ],
                    temperature=temperature,
                    response_format={"type": "json_object"},
                )
                raw = (response.choices[0].message.content or "").strip()

            else:
                print(f"[architect] Unknown provider '{provider}' — skipping.")
                continue

        except Exception as api_err:
            # On any API error (429 rate-limit, 500 server error, network)
            # log and immediately move to the next model — no retry.
            safe_err = str(api_err).encode("ascii", "ignore").decode("ascii")
            print(f"[architect] {provider}/{model_name} API error — {safe_err}")
            continue

        # ── Parse and validate the raw JSON string ────────────────────────────
        try:
            raw = _clean_llm_raw(raw)
            start = raw.find("{")
            end   = raw.rfind("}")
            if start == -1 or end == -1:
                print(f"[architect] {provider}/{model_name}: no JSON object found in output.")
                continue

            obj = json_repair.loads(raw[start:end + 1])
            if not isinstance(obj, dict):
                raise ValueError("LLM output was valid JSON but not a dictionary.")

            topology = TopologyResponse(**obj)
            safe_rationale = topology.design_rationale.encode("ascii", "ignore").decode("ascii")
            print(f"[architect] {provider}/{model_name} OK — {safe_rationale}")
            return topology

        except (ValueError, ValidationError) as parse_err:
            safe_err = str(parse_err).encode("ascii", "ignore").decode("ascii")
            print(f"[architect] {provider}/{model_name} parse error — {safe_err}")
            # Slightly increase creativity for the next model
            temperature = min(temperature + 0.1, 0.7)
            continue

    print("[architect] All models in fallback chain exhausted — returning None.")
    return None


# ── Main generator class ──────────────────────────────────────────────────────

class FloorPlanGenerator:
    def __init__(self):
        pass

    def generate_floorplan_json(
        self,
        plot_size: float,
        length: float,
        width: float,
        bedrooms: int,
        bathrooms: int,
        floors: int,
        duplex: int,
        balcony: int,
        terrace: int,
        lift: int,
        vastu: int,
        entry_dir: str = "East",
    ) -> dict:
        """
        Phase 1+2: Architect (LLM) generates topology, Drafter (Python) builds geometry.
        The LLM never sees or produces x,y,w,h coordinates.
        Returns {floors: [...]} or {error: "..."}.
        """
        try:
            # Step 1 — Ask the Architect LLM for a zoning topology
            prompt = _build_architect_prompt(
                length, width, bedrooms, bathrooms,
                duplex, balcony, terrace, lift, vastu, entry_dir
            )
            topology = _call_architect_llm(prompt, retries=len(FALLBACK_MODELS)-1)

            if topology is None:
                print("[architect] LLM failed — using default topology fallback.")
                topology = default_topology(bedrooms, bathrooms)

            # Step 2 — Pass topology to the deterministic Python Drafter
            layout = build_layout_from_topology(
                topology=topology,
                length=length,
                width=width,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                floors=floors,
                balcony=balcony,
                terrace=terrace,
                lift=lift,
                vastu=bool(vastu),
                entry_dir=entry_dir,
                duplex=bool(duplex),
            )

            # Step 3 — Inject furniture deterministically
            layout = inject_furniture(layout)

            # Step 4 — Phase 3: boundary-only safety check (never mutates valid geometry)
            layout = _run_boundary_check(layout, length, width)

            return layout

        except ValueError:
            # Let known validation/constraint errors bubble up to the route for a clean 422 response
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[generator] Generation failed: {e}")
            return {"error": str(e)}


# ── Phase 3: Boundary-only validator (safety net, not fixer) ─────────────────

def _run_boundary_check(layout: dict, plot_w: float | None = None, plot_h: float | None = None) -> dict:
    """
    Runs boundary-clamp ONLY (no overlap push-apart).
    The Drafter guarantees no overlaps by construction.
    If a room is found outside the boundary here, it is a Drafter bug — log loudly.
    """
    floors = layout.get("floors", [])
    for floor in floors:
        pw = float(floor.get("plot_width", plot_w or 0))
        ph = float(floor.get("plot_height", plot_h or 0))
        rooms = floor.get("rooms", [])
        checked_rooms, clamped = boundary_check_only(rooms, pw, ph)
        if clamped:
            print(f"[boundary-check] WARNING: {len(clamped)} room(s) out of bounds in "
                  f"'{floor.get('level')}' (plot {pw}x{ph}) — this indicates a Drafter bug: {clamped}")
        floor["rooms"] = checked_rooms
    return layout


# ── Legacy alias (kept for vastu_engine.py / main.py imports) ────────────────

def _validate_rooms(layout: dict, max_x: float, max_y: float) -> dict:
    """Legacy alias — now does boundary-only check."""
    return _run_boundary_check(layout, max_x, max_y)


# ── Fix 1: LLM-driven Vastu topology correction ───────────────────────────────

def _build_vastu_fix_prompt(
    length: float, width: float,
    bedrooms: int, bathrooms: int,
    violated_rules: list[dict],
    current_rationale: str,
) -> str:
    """Build a prompt asking the LLM to fix specific Vastu violations via topology changes."""
    rule_lines = "\n".join(
        f"  - {r['rule']}: {r['detail']} (currently {r['points']}/{r['max']})"
        for r in violated_rules
    )
    return f"""
You are the Lead AI Architect performing a Vastu compliance correction.

# Current Layout
- Plot: {length} ft wide x {width} ft deep
- Bedrooms: {bedrooms}, Bathrooms: {bathrooms}
- Current design rationale: {current_rationale}

# Vastu Violations to Fix
{rule_lines}

# Your Task
Revise the topology to address these violations. You MUST:
1. Keep the 3-bay structure (left_bay, spine, right_bay) — do NOT output coordinates.
2. Address the specific failing rules above (e.g. move Kitchen to SE by placing it in right_bay rear, move Master Bedroom to SW by placing it in left_bay).
3. Kitchen in right_bay with kitchen_position "rear" puts it in the Southeast — ideal for Vastu.
4. Master Bedroom in left_bay positions it in the Southwest — ideal for Vastu.
5. Total bathrooms_allocated across both bays must sum to {bathrooms}.

# Output Schema (ONLY this JSON, no wrapping, no explanations):
{{
  "topology": {{
    "left_bay": {{
      "rooms": ["Master Bedroom"],
      "bathrooms_allocated": 1
    }},
    "right_bay": {{
      "rooms": ["Living Room", "Dining Room", "Kitchen"],
      "open_plan_living_dining": false,
      "kitchen_position": "rear"
    }},
    "spine": {{
      "rooms": ["Foyer", "Corridor", "Staircase"]
    }}
  }},
  "design_rationale": "One sentence explaining the Vastu corrections made."
}}
"""


def fix_vastu_topology(
    length: float,
    width: float,
    bedrooms: int,
    bathrooms: int,
    floors: int,
    entry_dir: str,
    violated_rules: list[dict],
    max_retries: int = 2,
    balcony: int = 0,
    terrace: int = 0,
    lift: int = 0,
) -> dict:
    """
    Use the LLM to correct Vastu violations via topology changes, then rerun the Drafter.

    Returns:
        {
          "layout": dict,               # new full floor layout
          "converged": bool,            # True if score improved
          "attempts": int,              # how many LLM calls were made
          "design_rationale": str,
        }
    """

    best_layout: Optional[dict] = None
    best_rationale = ""

    current_violations = violated_rules
    for attempt in range(1, max_retries + 1):
        prompt = _build_vastu_fix_prompt(
            length, width, bedrooms, bathrooms,
            current_violations, best_rationale or "No prior rationale."
        )
        topology = _call_architect_llm(prompt, retries=1)

        if topology is None:
            print(f"[vastu-fix] Attempt {attempt}: LLM returned no topology — skipping.")
            continue

        try:
            layout = build_layout_from_topology(
                topology=topology,
                length=length,
                width=width,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                floors=floors,
                duplex=(floors > 1),
                balcony=balcony,
                terrace=terrace,
                lift=lift,
                vastu=True,
                entry_dir=entry_dir,
            )
            layout = inject_furniture(layout)
            layout = _run_boundary_check(layout, length, width)
            best_layout = layout
            best_rationale = topology.design_rationale
            print(f"[vastu-fix] Attempt {attempt}: topology applied. Rationale: {best_rationale}")
            break  # one successful Drafter run is enough per attempt
        except Exception as e:
            print(f"[vastu-fix] Attempt {attempt}: Drafter failed — {e}")
            continue

    return {
        "layout": best_layout,
        "converged": best_layout is not None,
        "attempts": attempt,
        "design_rationale": best_rationale,
    }


def _build_nbc_fix_prompt(
    length: float, width: float,
    bedrooms: int, bathrooms: int,
    violated_rules: list[dict],
    current_rationale: str,
) -> str:
    """Build a prompt asking the LLM to fix specific NBC violations via topology changes."""
    rule_lines = "\n".join(
        f"  - {r['rule']}: {r['detail']} (currently {r['points']}/{r['max']})"
        for r in violated_rules
    )
    return f"""
You are the Lead AI Architect performing an NBC compliance correction.

# Current Layout
- Plot: {length} ft wide x {width} ft deep
- Bedrooms: {bedrooms}, Bathrooms: {bathrooms}
- Current design rationale: {current_rationale}

# NBC Violations to Fix
{rule_lines}

# Your Task
Revise the topology to address these violations. You MUST:
1. Keep the 3-bay structure (left_bay, spine, right_bay) — do NOT output coordinates.
2. Address the specific failing rules above. For NBC compliance, setbacks and area ratios are critical. 
3. You CANNOT reduce room counts. You must allocate exactly {bedrooms} bedrooms across the bays.
4. Total bathrooms_allocated across both bays must sum to {bathrooms}.

# Output Schema (ONLY this JSON, no wrapping, no explanations):
{{
  "topology": {{
    "left_bay": {{
      "rooms": ["Master Bedroom"],
      "bathrooms_allocated": 1
    }},
    "right_bay": {{
      "rooms": ["Living Room", "Dining Room", "Kitchen"]
    }},
    "spine": {{
      "rooms": ["Foyer", "Corridor", "Staircase"]
    }}
  }},
  "design_rationale": "One sentence explaining the NBC corrections made."
}}
"""


def fix_nbc_topology(
    length: float,
    width: float,
    bedrooms: int,
    bathrooms: int,
    floors: int,
    entry_dir: str,
    violated_rules: list[dict],
    max_retries: int = 2,
    balcony: int = 0,
    terrace: int = 0,
    lift: int = 0,
) -> dict:
    """
    Use the LLM to correct NBC violations via topology changes, then rerun the Drafter.

    Returns:
        {
          "layout": dict,
          "converged": bool,
          "attempts": int,
          "design_rationale": str,
        }
    """

    best_layout: Optional[dict] = None
    best_rationale = ""

    current_violations = violated_rules
    for attempt in range(1, max_retries + 1):
        prompt = _build_nbc_fix_prompt(
            length, width, bedrooms, bathrooms,
            current_violations, best_rationale or "No prior rationale."
        )
        topology = _call_architect_llm(prompt, retries=1)

        if topology is None:
            print(f"[nbc-fix] Attempt {attempt}: LLM returned no topology — skipping.")
            continue

        try:
            layout = build_layout_from_topology(
                topology=topology,
                length=length,
                width=width,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                floors=floors,
                duplex=(floors > 1),
                balcony=balcony,
                terrace=terrace,
                lift=lift,
                vastu=False, # NBC fixes shouldn't enforce vastu
                entry_dir=entry_dir,
            )
            layout = inject_furniture(layout)
            layout = _run_boundary_check(layout, length, width)
            best_layout = layout
            best_rationale = topology.design_rationale
            print(f"[nbc-fix] Attempt {attempt}: topology applied. Rationale: {best_rationale}")
            break
        except Exception as e:
            print(f"[nbc-fix] Attempt {attempt}: Drafter failed — {e}")
            continue

    return {
        "layout": best_layout,
        "converged": best_layout is not None,
        "attempts": attempt,
        "design_rationale": best_rationale,
    }


# ── Fix 2: LLM-driven single-room topology regeneration ──────────────────────

_ROOM_SIZE_VOCAB = {
    "small":       0.7,
    "compact":     0.8,
    "medium":      1.0,
    "large":       1.2,
    "extra large": 1.4,
    "bigger":      1.2,
    "larger":      1.2,
    "smaller":     0.8,
    "wider":       1.2,
    "narrower":    0.8,
}

def _build_room_regen_prompt(
    room_name: str,
    instruction: str,
    length: float,
    width: float,
    bedrooms: int,
    bathrooms: int,
) -> str:
    return f"""
You are the Lead AI Architect handling a targeted room resize request.

# Current Layout
- Plot: {length} ft wide x {width} ft deep
- Bedrooms: {bedrooms}, Bathrooms: {bathrooms}

# User Request
Room: "{room_name}"
Instruction: "{instruction}"

# Your Task
Revise the topology to honour this request. The only thing you can change is:
- Which bay a room is allocated to
- The kitchen_position ("front" | "middle" | "rear")
- The bathrooms_allocated counts

You CANNOT change the 3-bay structure and MUST NOT output any coordinates.
If the request implies the room should be larger, prioritise it in its bay by listing it first.
If smaller, list it last.

# Output Schema (ONLY this JSON, no wrapping):
{{
  "topology": {{
    "left_bay": {{
      "rooms": ["Master Bedroom", "Bedroom 2"],
      "bathrooms_allocated": 2
    }},
    "right_bay": {{
      "rooms": ["Living Room", "Dining Room", "Kitchen"],
      "open_plan_living_dining": false,
      "kitchen_position": "rear"
    }},
    "spine": {{
      "rooms": ["Foyer", "Corridor", "Staircase"]
    }}
  }},
  "design_rationale": "One sentence explaining what changed for the room."
}}
"""


def fix_room_topology(
    room_name: str,
    instruction: str,
    length: float,
    width: float,
    bedrooms: int,
    bathrooms: int,
    floors: int,
    entry_dir: str,
    balcony: int = 0,
    terrace: int = 0,
    lift: int = 0,
) -> dict:
    """
    Use the LLM to update the topology to honour a natural-language room edit,
    then rerun the Drafter so the full layout is recomputed without overlaps.

    Returns:
        {
          "layout": dict | None,
          "converged": bool,
          "design_rationale": str,
          "llm_called": True,
        }
    """

    prompt = _build_room_regen_prompt(
        room_name, instruction, length, width, bedrooms, bathrooms
    )
    topology = _call_architect_llm(prompt, retries=1)

    if topology is None:
        return {
            "layout": None,
            "converged": False,
            "design_rationale": "LLM did not return a valid topology.",
            "llm_called": True,
        }

    try:
        layout = build_layout_from_topology(
            topology=topology,
            length=length,
            width=width,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            floors=floors,
            duplex=(floors > 1),
            balcony=balcony,
            terrace=terrace,
            lift=lift,
            vastu=False,
            entry_dir=entry_dir,
        )
        layout = inject_furniture(layout)
        layout = _run_boundary_check(layout, length, width)
        print(f"[room-regen] LLM topology applied: {topology.design_rationale}")
        return {
            "layout": layout,
            "converged": True,
            "design_rationale": topology.design_rationale,
            "llm_called": True,
        }
    except Exception as e:
        print(f"[room-regen] Drafter failed after LLM topology: {e}")
        return {
            "layout": None,
            "converged": False,
            "design_rationale": f"Drafter error: {e}",
            "llm_called": True,
        }

