import datetime
from typing import Dict, List, Any
import pysolar.solar as solar # type: ignore
from pydantic import BaseModel

# Bengaluru Coordinates
LATITUDE = 12.9716
LONGITUDE = 77.5946

# Evaluate for a typical equinox day to represent daily average
EVALUATION_DATE = datetime.datetime(2024, 3, 21, tzinfo=datetime.timezone.utc)

class SunlightRule(BaseModel):
    rule: str
    status: str  # 'pass', 'warn', 'fail'
    points: int
    max: int
    detail: str

class SunlightResult(BaseModel):
    score: int
    grade: str
    rules: List[SunlightRule]
    insights: List[str]
    windows_sunlight: Dict[str, Any]  # Store sunlight intensity per window for overlay

def _calculate_cardinal_sunlight() -> Dict[str, float]:
    """
    Calculates the average relative sunlight intensity for each cardinal direction
    over the course of the day (daily average).
    """
    intensity = {'North': 0.0, 'East': 0.0, 'South': 0.0, 'West': 0.0}

    # Evaluate 24 hours UTC
    for hour in range(24):
        dt = EVALUATION_DATE + datetime.timedelta(hours=hour)
        altitude = solar.get_altitude(LATITUDE, LONGITUDE, dt)
        if altitude <= 0:
            continue  # Night time
        
        azimuth = solar.get_azimuth(LATITUDE, LONGITUDE, dt)
        
        # In pysolar, 0 is usually South, 90 is West, 180 is North, 270 is East (standard convention)
        if azimuth >= 315 or azimuth < 45:
            intensity['South'] += altitude
        elif 45 <= azimuth < 135:
            intensity['West'] += altitude
        elif 135 <= azimuth < 225:
            intensity['North'] += altitude
        else:
            intensity['East'] += altitude

    # Normalize roughly to a max of 100 for the best direction
    max_val = max(intensity.values()) if max(intensity.values()) > 0 else 1
    return {k: (v / max_val) * 100 for k, v in intensity.items()}

def _get_global_wall_direction(entry_dir: str, local_wall: str) -> str:
    """
    Given the plot entry direction and a local wall ('top', 'bottom', 'left', 'right'),
    returns the global cardinal direction of that wall.
    Assume 'bottom' is the front/entry of the layout.
    """
    dirs = ['North', 'East', 'South', 'West']
    
    try:
        base_idx = dirs.index(entry_dir.capitalize())
    except ValueError:
        base_idx = 0 # Default North
        
    mapping = {
        'bottom': dirs[base_idx],
        'left': dirs[(base_idx + 1) % 4],
        'top': dirs[(base_idx + 2) % 4],
        'right': dirs[(base_idx + 3) % 4]
    }
    return mapping.get(local_wall, 'North')

def evaluate_sunlight(layout: dict, entry_dir: str = "East") -> dict:
    """
    Evaluates the sunlight received by rooms based on window placement.
    """
    sun_profile = _calculate_cardinal_sunlight()
    
    total_score: float = 0.0
    max_score = 0
    insights = []
    windows_sunlight = {}
    
    floors = layout.get("floors", [])
    
    for f_idx, floor in enumerate(floors):
        for room in floor.get("rooms", []):
            room_name = room.get("name", "Unknown")
            windows = room.get("windows", [])
            
            room_light: float = 0.0
            for w_idx, window in enumerate(windows):
                local_wall = window.get("wall")
                global_dir = _get_global_wall_direction(entry_dir, local_wall)
                intensity = sun_profile.get(global_dir, 0)
                
                room_light += intensity
                windows_sunlight[f"{f_idx}_{room_name}_{local_wall}_{w_idx}"] = {
                    "direction": global_dir,
                    "intensity": intensity
                }
            
            if len(windows) > 0:
                max_score += 100
                total_score += min(room_light, 100)
                
                if room_light > 75:
                    insights.append(f"{room_name} receives abundant natural light.")
                elif room_light > 30:
                    insights.append(f"{room_name} receives moderate natural light.")
                else:
                    insights.append(f"{room_name} might be poorly lit by natural light.")
            else:
                if "Bathroom" not in room_name and "Store" not in room_name:
                    max_score += 100
                    insights.append(f"{room_name} has no windows!")
                    
    final_score = int((total_score / max_score * 100)) if max_score > 0 else 100
    
    if final_score >= 80:
        grade = "A"
    elif final_score >= 60:
        grade = "B"
    elif final_score >= 40:
        grade = "C"
    else:
        grade = "D"
        
    return SunlightResult(
        score=final_score,
        grade=grade,
        rules=[],
        insights=insights,
        windows_sunlight=windows_sunlight
    ).model_dump()
