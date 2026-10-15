from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ProjectCreate(BaseModel):
    name: str
    layout_data: dict
    image_url: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    user_id: str
    name: str
    layout_data: dict
    image_url: Optional[str] = None
    created_at: datetime
