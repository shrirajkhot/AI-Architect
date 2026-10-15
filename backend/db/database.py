import os
from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore
from dotenv import load_dotenv

import certifi

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is missing. Please add it to backend/.env")

# Global client
from typing import Any
client: Any = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
db = client.ai_architect

# Collections
users_collection = db.get_collection("users")
projects_collection = db.get_collection("projects")
