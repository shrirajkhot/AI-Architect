# Technology Stack & Architecture

## Frontend Presentation Layer
- **Framework:** React 19 + TypeScript
- **Build Tooling:** Vite 8
- **Styling:** Vanilla CSS, custom glassmorphism design system
- **Theming:** Dual Light/Dark modes switched via CSS variables
- **Rendering:** Native HTML/Browser SVG for the 2D layout editor (drag-overlay pattern for 60FPS)

## Backend Processing Layer
- **Framework:** Python + FastAPI
- **Web Server:** Uvicorn (ASGI)
- **Database:** **MongoDB Atlas** via Motor (Async PyMongo). MONGO_URI is configured in `backend/.env`.
  - ⚠️ NOT SQLite — any docs/notes saying SQLite are incorrect.
- **Authentication:** Python-Jose (JWT HS256, 7-day expiry), Bcrypt password hashing.
- **Architecture & Structure:** Broken into distinct layers:
  - `core/`: Application-level config (auth algorithms).
  - `db/`: Pydantic models and the repository layer (`repositories.py`) for all Motor DB interactions.
  - `engines/`: Deterministic architecture generation (`architectural_layout.py`), circulation mapping (`circulation.py`), window placement (`window_placer.py`), BOM estimation (`bom_engine.py`), and rule scoring (`vastu_engine.py`, `nbc_engine.py`).
  - `exporters/`: Output generation (`pdf_report.py`, `dxf_exporter.py`, `floor_renderer.py`).
  - `routers/`: API endpoints (`auth_routes.py`, `projects_routes.py`, `engine_routes.py`).

## AI Infrastructure
- **Layout Engine:** **Deterministic Python** (`backend/engines/architectural_layout.py`) — all room geometry, corridor, door, window, and circulation path placement is handled in Python. The LLM is NOT used for spatial coordinates.
- **Window Placement:** `backend/engines/window_placer.py` — places windows on exterior walls after layout generation.
- **Circulation Paths:** `backend/engines/circulation.py` — BFS pathfinder on room adjacency graph, computes walking waypoints from entrance to every room.
- **Furniture Placement:** `backend/engines/architectural_layout.py:inject_furniture()` — catalog-based, no LLM call. Door-swing exclusion zones respected.
- **Vastu Scoring:** `backend/engines/vastu_engine.py` — rule-based scorer (10 rules, 3×3 compass grid) with centroid-based Brahmasthan calculation and architectural exemptions (staircases, corridors).
- **LLM Provider:** **Google AI Studio** with **HuggingFace** and **Groq** fallback.
- **LLM Models:** Fallback chain (Intelligence-first): `gemini-3.1-pro-preview` → `deepseek-ai/DeepSeek-V3-0324` → `gemini-3.8-flash` → `qwen/qwen3.8-27b` → `gemini-3.5-flash-lite`.
- **API Keys:** `GEMINI_API_KEY`, `HF_API_KEY`, and `GROQ_API_KEY` in `backend/.env`

## API Endpoints (key)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/generate` | ✅ JWT | Generate floor plan (layout + Vastu score + images) |
| POST | `/export/dxf` | ✅ JWT | Download DXF CAD file |
| POST | `/export/report` | ✅ JWT | Download 4-page PDF report (BOM + Vastu + images) |
| POST | `/vastu-fix` | ✅ JWT | AI-powered Vastu room repositioning |
| POST | `/regenerate-room` | ✅ JWT | NL room editing via LLM |
| GET/POST | `/projects` | ✅ JWT | CRUD for saved projects in MongoDB |
| POST | `/auth/register` | ❌ | User registration |
| POST | `/auth/login` | ❌ | User login (returns JWT) |

## Security Notes (as of Aug 2026)
- `/generate`, `/export/dxf`, `/export/report` endpoints require valid JWT (`Depends(get_current_user)`).
- JWT_SECRET raises `ValueError` on startup if missing (no insecure fallback).
- Error responses are sanitized — no raw exceptions or API context leaked to frontend.
- CORS origins are controlled by the CORS_ORIGINS env var (defaults to http://localhost:5173). Set CORS_ORIGINS for the production domain before deployment.
