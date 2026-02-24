from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from app.core.database import redis_client
import time

router = APIRouter()

class ActionRequest(BaseModel):
    action: str
    user_id: str
    data: Dict[str, Any] = {}

@router.post("/action")
async def log_action(request: ActionRequest):
    """Логирование действий пользователя"""
    try:
        # Добавляем действие в список
        action_data = {
            "action": request.action,
            "timestamp": time.time(),
            "data": request.data
        }
        
        redis_client.lpush(
            f"actions:{request.user_id}", 
            str(action_data)
        )
        
        # Ограничиваем список последними 100 действиями
        redis_client.ltrim(f"actions:{request.user_id}", 0, 99)
        
        return {
            "status": "success", 
            "action": request.action,
            "user_id": request.user_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/user/{user_id}/actions")
async def get_user_actions(user_id: str, limit: int = 10):
    """Получение действий пользователя"""
    try:
        actions = redis_client.lrange(f"actions:{user_id}", 0, limit - 1)
        return {
            "user_id": user_id,
            "actions": actions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))