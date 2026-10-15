"""
repositories.py
===============
Thin data-access layer. All Motor find/insert/delete calls live here.
Route handlers import named functions from this module; they do NOT
touch the Motor client directly.

No business logic here — just DB I/O.
"""

from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from db.database import users_collection, projects_collection


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user_by_email(email: str) -> dict | None:
    """Return the full user document or None if not found."""
    return await users_collection.find_one({"email": email})


async def get_user_by_id(user_id: str) -> dict | None:
    """Return the full user document by ObjectId string, or None if the id is malformed.
    
    Raises:
        Any Motor/pymongo exception other than InvalidId — these are genuine
        infrastructure failures and must NOT be silenced.
    """
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
    return await users_collection.find_one({"_id": oid})


async def create_user(user_doc: dict) -> str:
    """Insert a new user document. Returns the inserted id as a string."""
    result = await users_collection.insert_one(user_doc)
    return str(result.inserted_id)


# ── Projects ──────────────────────────────────────────────────────────────────

async def get_projects_for_user(user_id: str) -> list[dict]:
    """Return all projects owned by user_id, sorted newest-first."""
    cursor = projects_collection.find({"user_id": user_id}).sort("created_at", -1)
    projects = await cursor.to_list(length=100)
    for p in projects:
        p["id"] = str(p["_id"])
    return projects


async def get_project_by_id(project_id: str, user_id: str) -> dict | None:
    """Return a single project owned by user_id, or None.
    
    Raises:
        Any Motor/pymongo exception other than InvalidId — these are genuine
        infrastructure failures and must NOT be silenced.
    """
    try:
        oid = ObjectId(project_id)
    except InvalidId:
        return None
    project = await projects_collection.find_one({"_id": oid, "user_id": user_id})
    if project:
        project["id"] = str(project["_id"])
    return project


async def create_project(project_doc: dict) -> str:
    """Insert a new project document. Returns the inserted id as a string."""
    result = await projects_collection.insert_one(project_doc)
    return str(result.inserted_id)


async def update_project(project_id: str, project_doc: dict, user_id: str) -> bool:
    """Update an existing project document. Returns True if updated."""
    try:
        oid = ObjectId(project_id)
    except InvalidId:
        return False
    result = await projects_collection.update_one(
        {"_id": oid, "user_id": user_id},
        {"$set": project_doc}
    )
    return result.modified_count > 0

async def delete_project(project_id: str, user_id: str) -> int:
    """
    Delete a project owned by user_id.
    Returns the number of documents deleted (0 or 1).
    
    Raises:
        Any Motor/pymongo exception other than InvalidId.
    """
    try:
        oid = ObjectId(project_id)
    except InvalidId:
        return 0
    result = await projects_collection.delete_one({"_id": oid, "user_id": user_id})
    return result.deleted_count
