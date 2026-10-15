import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.auth_routes import router as auth_router
from routers.projects_routes import router as projects_router
from routers.engine_routes import router as engine_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup validation — raises on missing required env vars so the
    process exits immediately instead of silently misbehaving at runtime."""
    if not os.getenv("JWT_SECRET"):
        raise ValueError("CRITICAL: JWT_SECRET environment variable is missing. Cannot boot securely.")
    if not any([os.getenv("GOOGLE_API_KEY"), os.getenv("GEMINI_API_KEY"), os.getenv("GROQ_API_KEY"), os.getenv("HF_API_KEY")]):
        raise ValueError("CRITICAL: No LLM API Key found (need GOOGLE, GEMINI, HF, or GROQ). Cannot generate AI layouts.")
    yield  # App is live

app = FastAPI(title="AI Architect API", lifespan=lifespan)

# ── CORS Setup ────────────────────────────────────────────────────────────────
# Comma-separated origins via CORS_ORIGINS; defaults to the Vite dev server.
# Never use "*" here — allow_credentials=True makes wildcard origins invalid.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Static Files ──────────────────────────────────────────────────────────────
public_dir = os.path.join(os.path.dirname(__file__), "public")
os.makedirs(os.path.join(public_dir, "downloads"), exist_ok=True)
app.mount("/public", StaticFiles(directory=public_dir), name="public")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(engine_router)

@app.get("/")
def read_root():
    return {"message": "AI Architect API — Programmatic Floor Plan Generator"}

