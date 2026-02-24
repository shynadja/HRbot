from fastapi import APIRouter, HTTPException
from app.core.database import redis_client

router = APIRouter()

@router.get("/stats")
async def get_stats():
    """Получение статистики"""
    try:
        # Подсчет пользователей
        user_keys = redis_client.keys("user:*")
        users_count = len(user_keys)
        
        # Подсчет действий
        action_keys = redis_client.keys("actions:*")
        actions_count = len(action_keys)
        
        return {
            "users": users_count,
            "sessions": actions_count,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))