from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
from core.auth import get_current_user
from db.models import ProjectCreate, ProjectResponse
from db.repositories import get_projects_for_user, get_project_by_id, create_project, delete_project, update_project

router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: dict = Depends(get_current_user)):
    return await get_projects_for_user(current_user["id"])

@router.post("", response_model=ProjectResponse)
async def save_project(project: ProjectCreate, current_user: dict = Depends(get_current_user)):
    project_doc = {
        **project.model_dump(),
        "user_id":    current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    inserted_id = await create_project(project_doc)
    return {**project_doc, "id": inserted_id}

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_saved_project(project_id: str, project: ProjectCreate, current_user: dict = Depends(get_current_user)):
    project_doc = {
        **project.model_dump(),
        "user_id": current_user["id"],
        "updated_at": datetime.now(timezone.utc),
    }
    updated = await update_project(project_id, project_doc, current_user["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return {**project_doc, "id": project_id}

@router.get("/{project_id}", response_model=ProjectResponse)
async def fetch_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = await get_project_by_id(project_id, current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}")
async def remove_project(project_id: str, current_user: dict = Depends(get_current_user)):
    deleted = await delete_project(project_id, current_user["id"])
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return {"status": "success", "message": "Project deleted"}
