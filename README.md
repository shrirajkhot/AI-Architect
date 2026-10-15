# ⬡ AI Architect

AI Architect is an advanced, generative AI-powered floor plan generator and architectural layout engine. It takes user requirements (plot size, facing direction, rooms, floors, and Vastu compliance) and autonomously generates structurally sound, buildable floor plans, complete with a 2D interactive blueprint and AutoCAD-ready DXF exports.

## 🏗 The Architect-Drafter Hybrid Model

The core innovation of AI Architect is its **Architect-Drafter Hybrid Model**, which solves the fundamental problem of LLMs hallucinating overlapping or unbuildable physical coordinates:

1. **The AI Architect (LLM via HuggingFace Inference Router):** The LLM is strictly used for linguistic, topological, and spatial reasoning. It receives the user's requirements and generates a structured JSON topology. It decides *what* rooms exist, *how* they relate to each other, and *where* they roughly belong conceptually (e.g., "Kitchen in South-East"). It does **not** generate raw X, Y coordinates.
2. **The Deterministic Drafter (Python Grid Partitioner):** A strictly mathematical Python engine reads the topological JSON and structurally partitions the plot canvas. It mathematically guarantees 0 overlaps, perfect alignment, and precise parametric sizing (wall thickness, door gaps, circulation paths), effectively acting as a traditional draftsman.

## ✨ Features

- **Generative Floor Plans:** Input your plot dimensions, BHK requirements, and facing direction to instantly generate a full layout.
- **AI Copilot Editor:** Chat directly with the AI Copilot to iteratively request modifications (e.g., "Add an attached bath", "Make the kitchen larger"). The topology is instantly recalculated.
- **🧿 Vastu Shastra Engine:** Features a comprehensive Vastu scoring system (0-100) that evaluates room placement (e.g., Pooja room in NE, Kitchen in SE). Includes an **Auto-Fix** feature that automatically restructures the layout to improve the Vastu score.
- **Interactive Blueprint Editor:** A fully interactive React canvas allows you to view the plan, click on rooms to edit dimensions and positions, and view real-time circulation warnings.
- **Concept Sketch Generation:** A static, styled "Concept Sketch" rendering of the plan is generated entirely on the backend to match the frontend logic, ready for quick sharing.
- **AutoCAD DXF Export:** Download production-ready DXF files of your generated floor plans, complete with mathematically calculated inward-swinging door arcs, wall openings, and proper layer management.
- **Modern UI:** Built with a stunning Glassmorphism aesthetic, supporting both Nebula Dark Mode and Genesis Light Mode.

## 🛠 Tech Stack

### Frontend
- **Framework:** React 19 with TypeScript 6 & Vite 8
- **Routing:** React Router v7
- **Styling:** Vanilla CSS with custom theme-aware CSS variables (Light/Dark mode)
- **Icons & UI:** Lucide React, React Hot Toast

### Backend
- **Framework:** FastAPI (Python 3)
- **AI Integration:** Fallback chain: deepseek-ai/DeepSeek-V3-0324 (HF) -> Qwen/Qwen3-Coder-30B-A3B-Instruct (HF) -> openai/gpt-oss-120b (Groq)
- **CAD Generation:** `ezdxf`
- **Authentication:** JWT-based user auth

## 🚀 Getting Started

### Prerequisites
- Node.js (^20.19.0 || >=22.12.0)
- Python 3.9+
- Both a HuggingFace API Key (primary) and a Groq API Key (fallback) are mandatory for the LLM to boot.

### 1. Backend Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory and add your required environment variables:
```env
GROQ_API_KEY=gsk_your_api_key_here
HF_API_KEY=hf_your_huggingface_token
JWT_SECRET=your_super_secret_jwt_key
MONGO_URI=mongodb://localhost:27017/ai_architect
# CORS_ORIGINS is a comma-separated list of allowed domains. Defaults to http://localhost:5173 if unset.
CORS_ORIGINS=http://localhost:5173
```

Start the backend server:
```bash
uvicorn main:app --reload
```
The backend will run on `http://127.0.0.1:8000`.

### 2. Frontend Setup

Open a new terminal and run:

```bash
cd frontend
npm install
npm run dev
```
The frontend will run on `http://localhost:5173`.

## 📂 Project Structure

- `/backend`
  - `main.py`: App wiring and lifespan env validation only; generation orchestration now lives in `routers/engine_routes.py`.
  - `/routers`: API route handlers (e.g., `engine_routes.py`).
  - `/db`: Database models and repositories.
  - `/core`: Authentication and core configuration.
  - `/engines`:
    - `architectural_layout.py`: The "Drafter" logic (Grid partitioning, door/window generation).
    - `inference.py`: The "Architect" logic (LLM prompt engineering and topological generation).
    - `vastu_engine.py`: Vastu Shastra rule evaluation and scoring.
    - `nbc_engine.py`, `energy_engine.py`, `bom_engine.py`, `cost_rates.py`, `circulation.py`, `window_placer.py`, `layout_validator.py`
  - `/exporters`:
    - `dxf_exporter.py`: Mathematical DXF compilation using `ezdxf`.
    - `floor_renderer.py`, `pdf_report.py`
- `/frontend`
  - `/src/pages`: Main application views (Dashboard, Editor, Login, Register).
  - `/src/components`: Reusable UI components including the `InteractiveBlueprint` and `RoomEditor`.
  - `/src/services`: API client for connecting to the FastAPI backend.
