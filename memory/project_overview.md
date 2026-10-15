# AI Architect: Project Overview

## What is AI Architect?
AI Architect is a full-stack generative platform that converts natural language architectural requirements into mathematically precise, regulation-aware 2D floor plans. It combines the HuggingFace Inference Router fallback chain for topology planning with a deterministic Python drafter for all spatial geometry, ensuring pixel-perfect, overlap-free layouts on every generation.

## Core Architecture: Hybrid Drafter Model
The system uses an "Architect-Drafter" split:
1. **DeepSeek-V3-0324 (HF Router):** Decides room topology — which rooms go in which bay, how many bathrooms per floor, open-plan vs. separated living/dining.
2. **Deterministic Drafter (`architectural_layout.py`):** Converts topology decisions into exact pixel-perfect room coordinates using a 3-bay grid partitioner with strict cursor-based placement guarantees.

## Key Features

### Generation & Layout
- **AI Topology Engine:** Google's `gemini-3.1-pro-preview` (with DeepSeek fallback) uses CoT prompting to generate room placement decisions (not coordinates).
- **Deterministic Geometry:** All room x/y/width/height values are computed in Python — zero LLM hallucination risk on dimensions. Vertical pinning ensures multi-floor features (like staircases) stack flawlessly.
- **Window Placement:** `window_placer.py` automatically places windows on exterior walls, avoiding doors and corners.
- **Circulation Pathfinding:** `circulation.py` computes walking paths (BFS on adjacency graph) from entrance to every room.
- **Furniture Injection:** Catalog-based deterministic placement with door-swing exclusion zones.

### Analysis & Compliance
- **Vastu Shastra Scoring:** 10-rule geometric scoring engine (3×3 compass grid) utilizing centroid math and transition-space exemptions to guarantee 70+ baseline scores. Auto-Fix loop repositions failing rooms via LLM.
- **BOM Cost Estimation:** `bom_engine.py` computes room-level construction costs in INR (wall, flooring, MEP, openings + 30% labour).
- **NBC 2016 Compliance:** Setback, FAR, and minimum room-size checks against the Indian National Building Code.

### Export & Reporting
- **Interactive SVG Blueprint:** React 19 drag-and-drop canvas at 60FPS. Shows doors, windows, furniture, circulation paths.
- **3D WebGL Visualization:** `react-three-fiber` extrusion of 2D plans into interactive 3D spaces with detailed furniture and staircase meshes.
- **AutoCAD DXF Export:** Multi-layered DXF (WALLS, DOORS, WALLOPENING, WINDOW, LABELS, FURNITURE, DIMENSIONS) at 1ft = 304.8mm scale.
- **PNG Concept Sketch:** Pillow-rendered floor plan with grid, north arrow, scale bar, and title block.
- **PDF Architectural Report:** 4-page ReportLab PDF — cover, floor plan images, Vastu table, BOM cost breakdown.

### Cloud & Security
- **Cloud Persistence:** MongoDB Atlas via Motor (async). JWT HS256 authentication (Python-Jose + Bcrypt).
- **Project Management:** Save/load designs to "My Plans" dashboard with thumbnails.

## Academic Context
This project is a final-year engineering project. An IEEE-format paper (`ieee_paper_formatted.tex`) documents the system's algorithms, convergence rates, and architectural novelty. Key contributions:
- Hybrid LLM + Deterministic Drafter architecture (unique in academic literature).
- Formal Vastu compliance as a measurable geometric scoring function.
- Automated BOM cost estimation from purely geometric data.
