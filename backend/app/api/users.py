from fastapi import APIRouter, HTTPException
from app.core.database import redis_client

router = APIRouter()

@router.get("/{user_id}")
async def get_user(user_id: str):
    """Получение данных пользователя"""
    try:
        user_data = redis_client.hgetall(f"user:{user_id}")
        if not user_data:
            # Если пользователя нет, возвращаем базовые данные
            return {
                "id": user_id,
                "first_name": "Пользователь",
                "username": ""
            }
        return user_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{user_id}/save")
async def save_user(user_id: str, user_data: dict):
    """Сохранение данных пользователя"""
    try:
        redis_client.hset(f"user:{user_id}", mapping=user_data)
        return {"status": "success", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))