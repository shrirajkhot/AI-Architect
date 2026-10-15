from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from core.auth import get_password_hash, verify_password, create_access_token, get_current_user
from db.models import UserCreate, UserLogin
from db.repositories import get_user_by_email, create_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register_user(user: UserCreate):
    existing = await get_user_by_email(user.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(user.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isalpha() for c in user.password) or not any(c.isdigit() for c in user.password):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 letter and 1 number")

    user_doc = {
        "name":            user.name,
        "email":           user.email,
        "hashed_password": get_password_hash(user.password),
        "created_at":      datetime.now(timezone.utc),
    }
    inserted_id = await create_user(user_doc)

    access_token = create_access_token(data={"sub": inserted_id})
    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user":         {"id": inserted_id, "name": user.name, "email": user.email},
    }

@router.post("/login")
async def login_user(user: UserLogin):
    db_user = await get_user_by_email(user.email)
    if not db_user or not verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(db_user["_id"])
    access_token = create_access_token(data={"sub": user_id})
    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user":         {"id": user_id, "name": db_user["name"], "email": db_user["email"]},
    }

@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "name": current_user["name"], "email": current_user["email"]}
