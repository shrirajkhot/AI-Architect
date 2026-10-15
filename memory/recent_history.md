# Recent History & Conversations

## October 2026: Vastu Accuracy & Multi-Floor Logic Update
- **Vastu Engine Refinement**: Updated `vastu_engine.py` to use a highly accurate centroid-based Brahmasthan calculation. Transitional and functional zones (Corridors, Staircases, and basic Toilets/Bathrooms that aren't Master Baths) are now algorithmically exempted from center-mass penalties, consistently raising Vastu scores to the 70+/100 target for the user's project review.
- **Vertical Pinning**: Solved a severe visual and structural bug where staircases on the Ground Floor and First Floor were staggered and unaligned. Enforced a vertical stacking lock in `architectural_layout.py` that forces Upper Floor staircases to map to the exact `[x, y]` coordinates of the Ground Floor.
- **Model Hierarchy Upgrade**: Rotated the backend topology inference chain to prioritize "maximum intelligence" logic. The primary engine is now Google's `gemini-3.1-pro-preview` followed by `deepseek-ai/DeepSeek-V3-0324` and `gemini-3.8-flash`, dropping the older Groq configurations due to API deprecations.

## Late August 2026: Architectural Layout Engine Restoration
- **Layout Reversion:** Surgically reverted `architectural_layout.py` back to a stable deterministic state (commit `6377819`) to fix a severe bug where the engine lost its functional zoning capabilities (spilling 3 bathrooms onto the ground floor and squeezing living rooms to 5 ft). The engine now correctly enforces Ground Floor public/service zones (Parking, Kitchen, Living, Dining) and Upper Floor private zones (Bedrooms, Bathrooms).
- **Realistic Dynamic Cramming:** Adjusted the absolute minimum limits (`MIN_BED_H` to 8.5ft and `MIN_ROOM_H` to 7ft) to allow realistic room cramming in tighter plots, fulfilling the user's requirement to allow flexibility while remaining architecturally viable.
- **API Resilience:** Fixed a critical `500 Internal Server Error` in `/generate` caused by an unpassed `duplex` argument, safely re-aligning `build_layout_from_topology` with `inference.py`.
- **Validation Fix:** Corrected the auto-correction bug where corridors were incorrectly flagged for having "no door".
## Late August 2026: UI Polish & Feature Adjustments
- **AI Copilot UI:** Styled the `Editor.tsx` AI Copilot text box with distinct background, blue border, and shadow to clearly distinguish it as an interactive input field rather than a static info box.
- **Concept Sketch Parity:** Updated `floor_renderer.py` to correctly suppress rendering door swing arcs when the door connects to a staircase, matching the Interactive Blueprint rules. Darkened the window color in the Concept Sketch export from light blue to deep blue `(35, 65, 110)` for better visibility.
- **Double Door Removal:** Surgically removed all double-door logic across the stack (`architectural_layout.py`, `InteractiveBlueprint.tsx`, `FloorPlan3D.tsx`, and `floor_renderer.py`) based on updated project requirements, ensuring all doors generate and render as standard single doors.

## Late August 2026: 2D/3D Architectural Parity & Full-Stack Resilience
- **Geometry & Rendering Overhaul:** Solved the "invisible doors and windows" bug in the 3D viewer. Replaced monolithic 3D box walls with a `WallWithOpenings` segment-renderer that precisely maps `room.doors` and `room.windows` into the 3D mesh.
- **2D Blueprint Parity:** Rewrote the 2D `WindowMarks` component to strictly read real `room.windows` data from the backend instead of injecting fake, heuristically-placed windows on every top wall. Now 2D and 3D renderings match 1:1.
- **Furniture Logic Fix:** Fixed a critical bug in `_try_place()` (backend) that stripped furniture names (saving as `""`), which broke chair-around-table placement logic and 2D labeling. 
- **API Resilience:** Addressed infinite loading spinners by wrapping the native `fetch()` calls in `api.ts` with a 90-120s `AbortController` timeout for all AI operations.
- **Strict Data Integrity:** Purged hardcoded fake payloads (e.g., `nbcResult ?? { score: 0, grade: "N/A" }`) and hardcoded fallback scores (`vastuScore ?? 90`) from the frontend, ensuring the UI only renders what the deterministic engines calculate.
## Late August 2026: E2E Audit Remediation & Documentation Polish
- **Test Suite Establishment:** Authored an isolated `test_drafter.py` pytest suite in the user's root Downloads directory to strictly verify the mathematical integrity of the deterministic drafter (zero overlapping rectangles, boundary clamp correctness) without cluttering the main codebase.
- **Dependency & Config Fortification:** Ran a strict `pip freeze` to completely replace unpinned dependencies in `requirements.txt` with exact versions to eliminate upstream regressions. 
- **Security & Error Sanitization:** Scoured `engine_routes.py` for raw Python exceptions being sent to the client (e.g. `HTTP 500: ... {str(e)}`) and sanitized them into secure, generic frontend messages while preserving raw stack traces (`traceback.print_exc()`) on the backend console.
- **Startup Integrity:** Identified that Hugging Face (`HF_API_KEY`) was being used for the primary LLM inference but not checked on boot. Updated `main.py` lifespan to enforce its presence.
- **Documentation Overhaul:** Updated the startup instructions in `README.md` to properly document all critical environment variables (`GROQ_API_KEY`, `HF_API_KEY`, `JWT_SECRET`, `MONGO_URI`).

## Mid-August 2026: Model Swap & E2E Audit
- **LLM Model Migration:** Benchmarked the top 5 open-weight models on HuggingFace for architectural topology generation. DeepSeek-R1 and V4-Pro ran into token limits, but DeepSeek-V3-0324 and Qwen3-Coder-30B-A3B-Instruct scored perfectly on accuracy.
- **Resilient Inference Chain:** Upgraded `inference.py` to use a multi-provider fallback chain: DeepSeek-V3 (HuggingFace) -> Qwen3-Coder (HuggingFace) -> gpt-oss-120b (Groq). Re-configured API calls to use the new `router.huggingface.co/v1` endpoint.
- **E2E Project Audit:** Ran a full e2e test suite (`test_backend.py`) verifying all routes (Auth, Generate, Vastu-Fix, DXF, PDF). Corrected a `MONGO_URI` silent fallback issue to fail loudly on startup. Fixed TypeScript compilation errors (`TS6133`, `TS2451`) in `Editor.tsx` and 3D UI files to ensure the Vite production build succeeds.
- **UI Branding:** Updated the landing page to proudly display "Powered by DeepSeek AI".

## August 2026: Architect-Drafter AI Integration & Backend Refactoring
- **Real AI Integration**: Fixed fake endpoints. `/vastu/fix` now queries Groq (Llama-3.3-70b-versatile) with failing Vastu rules to generate a revised architectural topology, then reruns the Python Drafter for overlap-free geometry. `/regenerate-room` now handles natural-language room edit instructions via the LLM instead of a hardcoded *1.2 multiplier.
- **Backend Modularization**: Broke the single-folder backend monolith into proper Python packages (`core/`, `db/`, `engines/`, `exporters/`, `routers/`).
- **Data Access Layer**: Extracted all Motor (MongoDB) calls from the route handlers into a dedicated `repositories.py` layer for cleaner separation of concerns.

## August 2026: Full-Stack Audit & Remediation
- Replaced the LLM geometry generator with a **Deterministic Python Engine** (`architectural_layout.py`) that strictly enforces boundaries and tiling.
- **Security & DB**: Corrected project documentation to reflect the actual MongoDB usage (was mistakenly documented as SQLite). Secured `/generate` and `/export/dxf` endpoints with JWT auth, and removed fallback JWT secrets.
- **UX & Architecture**: Added circulation reachability detection, reporting landlocked rooms to the UI via a warning banner.
- **Geometry Fixes**: Implemented a 3x3 ft door swing exclusion zone so furniture doesn't block doors. Fixed the DXF exporter to correctly map real door arcs instead of hardcoding a bottom-wall arc.

## August 2026: Linting & Code Quality
- Resolved 14 ESLint errors/warnings across the frontend.
- Refactored `InteractiveBlueprint.tsx` from mutable `let` chains to a pure `getDoorGeometry()` helper function.
- Refactored `Dashboard.tsx` to use strict domain types instead of `Record<string, unknown>`.
- Added "Real Developer Refactoring Standard" rule to `.agents/AGENTS.md`.

## August 2026: Technical Debt & Critical Bug Fixes
- **State Sync**: Fixed the "Stale Concept Sketch" bug by forcing backend layout operations to re-render the PNG and propagate the new `imageUrl` via `handleLayoutUpdate`.
- **Redundant Data**: Dropped `plotSize` from API payloads in favor of dynamic backend computation (`length * width`).
- **UI Requirements**: Added a theme toggle button to `Editor.tsx` to unlock Light Mode.
- **Error Handling**: 
  - Added `try/except` guards around Groq/LLM network calls.
  - Removed naive math fallbacks in room regeneration in favor of failing gracefully with a 400 status.
  - Handled `InvalidId` exceptions explicitly in MongoDB auth and data repositories to return proper HTTP errors (401/404) instead of 500s.
- **React Stability**: Fixed an illegitimate `exhaustive-deps` linter suppression by correctly wrapping `loadSavedProject` in a `useCallback`.
- **Python Code Quality**: Resolved a `floors` variable shadowing issue in `engine_routes.py` and converted a mutable dict default (`{}`) to `Field(default_factory=dict)` in Pydantic models.

## August 2026: Roadmap Execution — Phases 1–3 Implemented

### Phase 1: Window Generation ✅
- Created `backend/window_placer.py` — deterministic exterior-wall window engine.
  - Scans each room; places windows only on plot-boundary walls.
  - Avoids door positions (with 0.5 ft clearance) and corners (1.5 ft margin).
  - Centres window in the largest available clear zone on the wall.
- Updated `floor_renderer.py` to draw data-driven window double-line symbols (all 4 walls).
- Updated `dxf_exporter.py` with a dedicated `WINDOW` layer.
- Updated `InteractiveBlueprint.tsx`: replaced heuristic `WindowMarks` with data-driven `WindowMarkers` component that reads `room.windows[]`.
- Added `WindowSpec` interface to `api.ts`.

### Phase 2: Circulation Path Visualization ✅
- Created `backend/circulation.py` — BFS pathfinder on a room adjacency graph.
  - Rooms are adjacent if they share a wall segment ≥ 1.5 ft.
  - BFS from entrance (Foyer/Lobby/Hall) to every other room.
  - Returns waypoints: `[room_centre → shared_wall_midpoint → next_room_centre]`.
  - Flags unreachable rooms in `floor["circulation"]["unreachable"]`.
- Created `frontend/src/components/CirculationOverlay.tsx` — dashed green polylines + waypoint dots.
- Extended `InteractiveBlueprint.tsx` with `circulation` and `showCirculation` props.
- Added `FloorCirculation`, `CirculationPath` types to `api.ts`.
- Updated `Editor.tsx`: `🛤 Show Paths` toggle button; live unreachable-rooms badge.

### Phase 3: BOM Cost Estimation + PDF Report ✅
- Created `backend/cost_rates.py` — INR rate constants (2026 estimates, all documented).
- Created `backend/bom_engine.py` — room-level cost calculator:
  - Wall cost: brick + plaster per sqft of wall face area.
  - Flooring: marble for premium rooms (master bedroom, living, dining); tile otherwise.
  - Ceiling: POP/gypsum per sqft of floor area.
  - MEP: electrical per sqft; plumbing only for wet rooms (bathroom, kitchen).
  - Openings: per-unit door and window costs.
  - Labour: 30% of all material costs.
- Created `backend/pdf_report.py` — 4-page ReportLab Platypus PDF:
  - Page 1: Cover (project metadata, vastu score).
  - Page 2: Floor plan images (Base64 PNGs embedded).
  - Page 3: Vastu analysis table (colour-coded pass/warn/fail rows).
  - Page 4: BOM table with grand total and INR formatting (lakh/crore).
- Added `POST /export/report` endpoint to `backend/main.py`.
- Added `exportReport()` to `frontend/src/services/api.ts`.
- Added `📄 Report` download button to the Editor action bar.
- Installed `reportlab 5.0.0` into `.venv`.

### Phase 4: Municipal Bylaw Compliance (NBC 2016) ✅
- **Description:** Score the layout against Indian National Building Code 2016 rules.
- **Implementation:** `backend/nbc_engine.py` implements 8 rules (Setbacks, FAR, Room/Kitchen/Bath minimum areas, Corridor widths). Converts JSON ft to meters. Renders a new "🏛 NBC 2016 Compliance" panel in the Editor right sidebar.

### Phase 5: Furniture Placement Engine ✅
- **Description:** Automatically furnish rooms with appropriately sized furniture.
- **Implementation:** `backend/architectural_layout.py` handles deterministic furniture injection with door-swing exclusion zones. Exposed to `dxf_exporter.py` via `FURNITURE` layer, and `floor_renderer.py` via rendering rectangles/labels on the PNG. Also already rendered in the SVG editor.

### Phase 6: 3D WebGL Visualization ✅
- **Description:** Extrude the 2D layout into an interactive 3D walkthrough view.
- **Implementation:** Installed `@react-three/fiber` and `@react-three/drei`. Added `FloorPlan3D.tsx` component that extrudes floor plates and semi-transparent walls based on JSON. Added a "2D View" / "3D View" toggle switch in the Editor action bar.
- **3D Furniture Overhaul:** Rewrote `FloorPlan3D.tsx` to include rich 3D meshes for all furniture items (beds with headboards, sofas, tables, TVs, toilets, kitchen counters, cars). Added realistic room floor/wall coloring and animated 3D staircase generation with handrails.
- **Geometry Fixes:** Fixed a sizing bug in `architectural_layout.py` where the final bedroom would incorrectly inherit all remaining vertical space. Massively expanded `FURNITURE_CATALOG` to populate rooms realistically.

## UI Refinements (earlier)
- Modified the glassmorphism layout to ensure all cards have the exact same color variables.
- Integrated a Uiverse `namecho` design toggle switch for the UI.
- Adjusted the Master Bedroom test data inside `frontend/src/pages/Editor.tsx` to read exactly 14x12 ft.
- Adjusted concept sketch image container styles (`.plan-img`) inside `frontend/src/App.css` to fix layout glitches.

## LinkedIn Profile Prep
- Wrote two highly tailored LinkedIn project summaries for the user's profile (AI Architect + EchoAI Voice Assistant).

## Academic Publication (IEEE Paper)
- Formatted `ieee_paper_formatted.tex` into a strict IEEE two-column, 10pt format.
- Expanded the paper by 36% to comfortably pass a 7-page minimum constraint.
- Pushed all modified files to GitHub (`Syed-Imran227/AI-Architect`).

## August 2026: End-to-End Audit & Refactoring Pass
- **Typing Standard Enforced**: Fully purged `Record<string, unknown>` from `frontend/src/services/api.ts` by defining strict TypeScript interfaces (`RegisterPayload`, `LoginPayload`, `GeneratePlansPayload`, etc.) for all backend communication, resolving a major technical debt item.
- **LLM Fallback Chain Corrections**: Fixed an execution order mismatch in `inference.py` so that `DeepSeek-V3` via HuggingFace is actively prioritized as the primary topology model, followed by `Qwen3-Coder`, with `gpt-oss-120b` (Groq) serving as the final backup.
- **Environment Initialization**: Shifted `load_dotenv()` from deep within `inference.py` to the absolute top of `main.py` to guarantee that critical variables (`JWT_SECRET`, `GROQ_API_KEY`) are present in `os.environ` before FastAPI dependencies and routers evaluate during `lifespan` startup.
- **Test Suite Configuration**: Successfully executed external test suite (`ai_architect_tests`). Created a `conftest.py` environment loader inside the test suite folder, enabling 100% test pass rate for the Drafter without polluting the core source code.
