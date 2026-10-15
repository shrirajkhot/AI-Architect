from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Any
import uuid
import base64
import traceback

from core.auth import get_current_user
from engines.inference import FloorPlanGenerator, fix_vastu_topology, fix_room_topology, fix_nbc_topology
from exporters.dxf_exporter import export_to_dxf
from exporters.floor_renderer import render_floor_plan
from engines.vastu_engine import score_vastu
from engines.nbc_engine import score_nbc
from engines.energy_engine import score_energy
from engines.bom_engine import compute_bom
from engines.sunlight_engine import evaluate_sunlight
from exporters.pdf_report import generate_report_pdf

router = APIRouter(tags=["engine"])
ai_generator = FloorPlanGenerator()

class GenerateRequest(BaseModel):
    length: float = Field(..., ge=30, le=500)
    width: float = Field(..., ge=30, le=500)
    floors: int = Field(1, ge=1, le=10)
    duplex: bool
    bedrooms: int = Field(..., ge=0, le=20)
    bathrooms: int = Field(..., ge=0, le=20)
    balcony: int  # 0 = no balcony, 1 = has balcony (boolean flag, not a count)
    terrace: bool
    lift: bool
    vastuToggle: bool
    entryDir: str

@router.post("/generate")
def generate_plans(req: GenerateRequest, current_user: dict = Depends(get_current_user)):
    plan_id = f"plan_{uuid.uuid4().hex[:8]}"
    plot_size = req.length * req.width

    try:
        json_layout = ai_generator.generate_floorplan_json(
            plot_size = plot_size,
            length    = req.length,
            width     = req.width,
            bedrooms  = req.bedrooms,
            bathrooms = req.bathrooms,
            floors    = req.floors,
            duplex    = int(req.duplex),
            balcony   = req.balcony,
            terrace   = int(req.terrace),
            lift      = int(req.lift),
            vastu     = int(req.vastuToggle),
            entry_dir = req.entryDir,
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"AI inference engine failed: {str(e)}"
        )

    if "error" in json_layout:
        raise HTTPException(
            status_code=500,
            detail="AI Layout Generation Failed. Please try again."
        )

    floor_list = json_layout.get("floors", [])
    if not floor_list:
        raise HTTPException(status_code=500, detail="AI returned an empty floor list")
        
    try:
        unit_label = f"{int(plot_size)} sqft · {req.bedrooms}BHK · {req.entryDir} Entry"

        # The drafter lays x over `width` and y over `length`, and emits
        # plot_width/plot_height to match. Pass those, never the raw request
        # fields in the other order: on a non-square plot that transposition
        # collapses every room into one compass zone (measured: a 30x80 plot put
        # all 8 rooms in NE), corrupting Vastu, NBC and Energy scoring alike.
        plot_x = float(floor_list[0].get("plot_width", req.width))
        plot_y = float(floor_list[0].get("plot_height", req.length))

        for floor in floor_list:
            floor_rooms = floor.get("rooms", [])
            floor_label = f"{floor.get('level', 'Floor')} | {unit_label}"
            png_bytes = render_floor_plan(floor_rooms, unit_label=floor_label, plot_w=plot_x, plot_h=plot_y, entry_dir=req.entryDir)
            
            b64_str = base64.b64encode(png_bytes).decode("utf-8")
            floor["imageUrl"] = f"data:image/png;base64,{b64_str}"
        
        data_uri = floor_list[0]["imageUrl"]
        
    except Exception as e:
        print(f"Render Error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Floor Plan Rendering Failed due to an internal error."
        )

    ground_rooms = floor_list[0].get("rooms", [])
    vastu_rooms = list(ground_rooms)
    if len(floor_list) > 1:
        vastu_rooms.extend(floor_list[1].get("rooms", []))

    vastu_result = score_vastu(
        rooms    = vastu_rooms,
        plot_w   = plot_x,
        plot_h   = plot_y,
        entry_dir = req.entryDir,
    ) if req.vastuToggle else {"score": 0, "grade": "Disabled", "rules": []}

    nbc_result = score_nbc(
        rooms      = ground_rooms,
        plot_w     = plot_x,
        plot_h     = plot_y,
        num_floors = req.floors,
    )

    energy_result = score_energy(
        rooms     = ground_rooms,
        plot_w    = plot_x,
        plot_h    = plot_y,
        entry_dir = req.entryDir,
    )

    sunlight_result = evaluate_sunlight(
        layout    = json_layout,
        entry_dir = req.entryDir,
    )

    bom_result = compute_bom(json_layout)

    return {
        "status": "success",
        "candidates": [
            {
                "id":                   plan_id,
                "imageUrl":             data_uri,
                "layout":               json_layout,
                "vastuScore":           vastu_result["score"],
                "vastuResult":          vastu_result,
                "nbcResult":            nbc_result,
                "energyResult":         energy_result,
                "sunlightResult":       sunlight_result,
                "bomResult":            bom_result,
                "validationReport":     json_layout.get("validation_report", []),
                "circulationWarnings":  json_layout.get("circulation_warnings", []),
            }
        ],
    }


class BomRecalculateRequest(BaseModel):
    layout: dict
    sqft: float = 0.0
    tier: str = "standard"

@router.post("/bom/recalculate")
def recalculate_bom(req: BomRecalculateRequest, current_user: dict = Depends(get_current_user)):
    try:
        new_bom = compute_bom(req.layout, req.sqft, req.tier)
        return {"status": "success", "bomResult": new_bom}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to recalculate BOM: {str(e)}")


class DxfExportRequest(BaseModel):
    rooms: List[Any]
    plan_id: str
    plot_width: float = Field(40.0, gt=0, le=500)
    plot_height: float = Field(30.0, gt=0, le=500)

@router.post("/export/dxf")
def export_dxf(req: DxfExportRequest, current_user: dict = Depends(get_current_user)):
    try:
        dxf_bytes = export_to_dxf(req.rooms, plot_w=req.plot_width, plot_h=req.plot_height)
        return Response(
            content=dxf_bytes,
            media_type="application/dxf",
            headers={
                "Content-Disposition": f'attachment; filename="floorplan_{req.plan_id}.dxf"'
            }
        )
    except Exception as e:
        print(f"DXF Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate DXF")


class PdfExportRequest(BaseModel):
    layout: dict
    vastu_result: dict
    plan_id: str
    project_meta: dict

@router.post("/export/pdf")
def export_pdf(req: PdfExportRequest, current_user: dict = Depends(get_current_user)):

    try:
        length = float(req.project_meta.get("length", 40))
        width = float(req.project_meta.get("width", 30))
        sqft = round(length * width)
        
        cost_bom = compute_bom(req.layout, sqft)
        
        pdf_bytes = generate_report_pdf(
            layout=req.layout,
            vastu_result=req.vastu_result,
            bom=cost_bom,
            project_meta=req.project_meta,
        )
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="report_{req.plan_id}.pdf"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF Report due to an internal server error: {str(e)}")


class VastuFixRequest(BaseModel):
    layout: dict
    plot_width: float = Field(40.0, ge=30, le=500)
    plot_height: float = Field(40.0, ge=30, le=500)
    entry_dir: str = "east"
    bedrooms: int = Field(2, ge=0, le=20)
    bathrooms: int = Field(2, ge=0, le=20)
    floors: int = Field(1, ge=1, le=10)
    balcony: int = 0
    terrace: int = 0
    lift: int = 0
    # The current vastu_result so we can score before/after
    vastu_result: dict = Field(default_factory=dict)

@router.post("/vastu/fix")
def vastu_fix(req: VastuFixRequest, current_user: dict = Depends(get_current_user)):
    """
    Corrects Vastu violations by sending failing rules to the LLM as a topology
    revision request, then rerunning the deterministic Drafter to produce
    guaranteed-overlap-free coordinates. Scores before and after.
    """
    try:
        # Identify which rules are actually failing (status != 'pass')
        current_rules = req.vastu_result.get("rules", [])
        before_score = req.vastu_result.get("score", 0)
        violated = [r for r in current_rules if r.get("status") in ("fail", "warn")]

        if not violated:
            return {
                "status": "already_optimal",
                "message": "No Vastu violations found — layout is already optimal.",
                "before_score": before_score,
                "after_score": before_score,
                "fixed_layout": req.layout.get("rooms") or (
                    req.layout.get("floors", [{}])[0].get("rooms", [])
                ),
            }

        best_layout = None
        best_vastu = None
        best_rationale = ""
        best_score = before_score

        # Loop up to 3 times to ensure the score strictly improves
        for attempt in range(3):
            result = fix_vastu_topology(
                length=req.plot_height,
                width=req.plot_width,
                bedrooms=req.bedrooms,
                bathrooms=req.bathrooms,
                floors=req.floors,
                entry_dir=req.entry_dir,
                violated_rules=violated,
                max_retries=1,
                balcony=req.balcony,
                terrace=req.terrace,
                lift=req.lift,
            )

            if not result["converged"] or result["layout"] is None:
                continue

            new_layout = result["layout"]
            ground_rooms = new_layout["floors"][0]["rooms"]

            vastu_rooms = list(ground_rooms)
            if len(new_layout["floors"]) > 1:
                vastu_rooms.extend(new_layout["floors"][1]["rooms"])

            # Re-score the corrected layout
            new_vastu = score_vastu(
                rooms=vastu_rooms,
                plot_w=req.plot_width,
                plot_h=req.plot_height,
                entry_dir=req.entry_dir,
            )

            if new_vastu["score"] > best_score:
                best_score = new_vastu["score"]
                best_layout = new_layout
                best_vastu = new_vastu
                best_rationale = result["design_rationale"]
                break

        if best_layout is None:
            return {
                "status": "already_optimal",
                "message": "Vastu fix could not find a layout that strictly improves the score.",
                "before_score": before_score,
                "after_score": before_score,
                "fixed_layout": req.layout.get("rooms") or req.layout.get("floors", [{}])[0].get("rooms", []),
            }

        new_layout = best_layout
        ground_rooms = new_layout["floors"][0]["rooms"]
        assert best_vastu is not None
        new_vastu = best_vastu

        new_nbc = score_nbc(
            rooms=ground_rooms,
            plot_w=req.plot_width,
            plot_h=req.plot_height,
            num_floors=req.floors,
        )

        # Render ALL floors so duplex layouts get a fresh image for every floor
        floor_images: list[str] = []
        for fl in new_layout["floors"]:
            fl_rooms = fl.get("rooms", [])
            fl_label = f"{fl.get('level', 'Floor')} | Vastu-Optimised Plan"
            png_bytes = render_floor_plan(fl_rooms, unit_label=fl_label, plot_w=req.plot_width, plot_h=req.plot_height, entry_dir=req.entry_dir)
            b64 = base64.b64encode(png_bytes).decode("utf-8")
            image_url = f"data:image/png;base64,{b64}"
            fl["imageUrl"] = image_url
            floor_images.append(image_url)
        image_url = floor_images[0]  # primary (ground floor) image for backward compat

        sqft_plot = round(req.plot_width * req.plot_height)
        new_energy = score_energy(ground_rooms, req.plot_width, req.plot_height, req.entry_dir)
        new_sunlight = evaluate_sunlight(new_layout, req.entry_dir)
        new_bom = compute_bom(new_layout, sqft_plot)

        return {
            "status": "success",
            "before_score": before_score,
            "after_score": new_vastu["score"],
            "new_vastu_result": new_vastu,
            "new_nbc_result": new_nbc,
            "design_rationale": best_rationale,
            "converged": True,
            "fixed_layout": ground_rooms,
            "imageUrl": image_url,
            "full_layout": new_layout,
            "new_energy_result": new_energy,
            "new_sunlight_result": new_sunlight,
            "new_bom_result": new_bom,
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Auto-fix failed due to an internal server error: {str(e)}")


class NbcFixRequest(BaseModel):
    layout: dict
    plot_width: float = Field(40.0, ge=30, le=500)
    plot_height: float = Field(40.0, ge=30, le=500)
    entry_dir: str = "east"
    bedrooms: int = Field(2, ge=0, le=20)
    bathrooms: int = Field(2, ge=0, le=20)
    floors: int = Field(1, ge=1, le=10)
    balcony: int = 0
    terrace: int = 0
    lift: int = 0
    nbc_result: dict = Field(default_factory=dict)

@router.post("/nbc/fix")
def nbc_fix(req: NbcFixRequest, current_user: dict = Depends(get_current_user)):
    try:
        current_rules = req.nbc_result.get("rules", [])
        before_score = req.nbc_result.get("score", 0)
        violated = [r for r in current_rules if r.get("status") in ("fail", "warn")]

        if not violated:
            return {
                "status": "already_optimal",
                "message": "No NBC violations found — layout is already compliant.",
                "before_score": before_score,
                "after_score": before_score,
                "fixed_layout": req.layout.get("rooms") or (
                    req.layout.get("floors", [{}])[0].get("rooms", [])
                ),
            }

        best_layout = None
        best_nbc = None
        best_rationale = ""
        best_score = before_score

        # Loop up to 3 times to ensure the score strictly improves
        for attempt in range(3):
            result = fix_nbc_topology(
                length=req.plot_height,
                width=req.plot_width,
                bedrooms=req.bedrooms,
                bathrooms=req.bathrooms,
                floors=req.floors,
                entry_dir=req.entry_dir,
                violated_rules=violated,
                max_retries=1,
                balcony=req.balcony,
                terrace=req.terrace,
                lift=req.lift,
            )

            if not result["converged"] or result["layout"] is None:
                continue

            new_layout = result["layout"]
            ground_rooms = new_layout["floors"][0]["rooms"]

            new_nbc = score_nbc(
                rooms=ground_rooms,
                plot_w=req.plot_width,
                plot_h=req.plot_height,
                num_floors=req.floors,
            )

            if new_nbc["score"] > best_score:
                best_score = new_nbc["score"]
                best_layout = new_layout
                best_nbc = new_nbc
                best_rationale = result["design_rationale"]
                break

        if best_layout is None:
            return {
                "status": "already_optimal",
                "message": "NBC fix could not find a layout that strictly improves the score.",
                "before_score": before_score,
                "after_score": before_score,
                "fixed_layout": req.layout.get("rooms") or req.layout.get("floors", [{}])[0].get("rooms", []),
            }

        new_layout = best_layout
        ground_rooms = new_layout["floors"][0]["rooms"]
        assert best_nbc is not None
        new_nbc = best_nbc

        vastu_rooms = list(ground_rooms)
        if len(new_layout["floors"]) > 1:
            vastu_rooms.extend(new_layout["floors"][1]["rooms"])

        new_vastu = score_vastu(
            rooms=vastu_rooms,
            plot_w=req.plot_width,
            plot_h=req.plot_height,
            entry_dir=req.entry_dir,
        )

        # Render ALL floors so duplex layouts get a fresh image for every floor
        floor_images2: list[str] = []
        for fl in new_layout["floors"]:
            fl_rooms = fl.get("rooms", [])
            fl_label = f"{fl.get('level', 'Floor')} | NBC-Optimised Plan"
            png_bytes = render_floor_plan(fl_rooms, unit_label=fl_label, plot_w=req.plot_width, plot_h=req.plot_height, entry_dir=req.entry_dir)
            b64 = base64.b64encode(png_bytes).decode("utf-8")
            image_url = f"data:image/png;base64,{b64}"
            fl["imageUrl"] = image_url
            floor_images2.append(image_url)
        image_url = floor_images2[0]

        sqft_plot = round(req.plot_width * req.plot_height)
        new_energy = score_energy(ground_rooms, req.plot_width, req.plot_height, req.entry_dir)
        new_sunlight = evaluate_sunlight(new_layout, req.entry_dir)
        new_bom = compute_bom(new_layout, sqft_plot)

        return {
            "status": "success",
            "before_score": before_score,
            "after_score": new_nbc["score"],
            "new_vastu_result": new_vastu,
            "new_nbc_result": new_nbc,
            "design_rationale": best_rationale,
            "converged": True,
            "fixed_layout": ground_rooms,
            "imageUrl": image_url,
            "full_layout": new_layout,
            "new_energy_result": new_energy,
            "new_sunlight_result": new_sunlight,
            "new_bom_result": new_bom,
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Auto-fix failed due to an internal server error: {str(e)}")


class RegenerateRoomRequest(BaseModel):
    rooms: List[Any]
    room_name: str
    instruction: str
    # Real plot dimensions — no more hardcoded 40×30
    plot_width: float = Field(40.0, ge=30, le=500)
    plot_height: float = Field(30.0, ge=30, le=500)
    entry_dir: str = "east"
    bedrooms: int = Field(2, ge=0, le=20)
    bathrooms: int = Field(2, ge=0, le=20)
    floors: int = Field(1, ge=1, le=10)
    balcony: int = 0
    terrace: int = 0
    lift: int = 0

@router.post("/regenerate-room")
def regenerate_room(req: RegenerateRoomRequest, current_user: dict = Depends(get_current_user)):
    """
    Uses the LLM to revise the layout topology based on a natural-language room
    instruction, then reruns the Drafter for guaranteed overlap-free geometry.
    Falls back gracefully if the LLM call fails.
    """
    try:
        result = fix_room_topology(
            room_name=req.room_name,
            instruction=req.instruction,
            length=req.plot_height,
            width=req.plot_width,
            bedrooms=req.bedrooms,
            bathrooms=req.bathrooms,
            floors=req.floors,
            entry_dir=req.entry_dir,
            balcony=req.balcony,
            terrace=req.terrace,
            lift=req.lift,
        )

        if result["converged"] and result["layout"] is not None:
            ground_rooms = result["layout"]["floors"][0]["rooms"]
            
            png_bytes = render_floor_plan(ground_rooms, unit_label="AI-Edited Room Plan", plot_w=req.plot_width, plot_h=req.plot_height, entry_dir=req.entry_dir)
            b64_str = base64.b64encode(png_bytes).decode("utf-8")
            image_url = f"data:image/png;base64,{b64_str}"

            sqft_plot = round(req.plot_width * req.plot_height)
            new_energy = score_energy(ground_rooms, req.plot_width, req.plot_height, req.entry_dir)
            new_sunlight = evaluate_sunlight(result["layout"], req.entry_dir)
            new_bom = compute_bom(result["layout"], sqft_plot)

            return {
                "rooms": ground_rooms,
                "imageUrl": image_url,
                "llm_called": True,
                "design_rationale": result["design_rationale"],
                "full_layout": result["layout"],
                "new_energy_result": new_energy,
                "new_sunlight_result": new_sunlight,
                "new_bom_result": new_bom,
            }

        raise HTTPException(
            status_code=400,
            detail=f"AI could not safely perform this edit without causing layout collisions. ({result['design_rationale']})"
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Regeneration failed due to an internal server error: {str(e)}")
