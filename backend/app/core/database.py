import redis
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Redis клиент
try:
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5
    )
    # Проверяем подключение
    redis_client.ping()
    logger.info(f"✅ Redis connected to {settings.REDIS_HOST}:{settings.REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ Redis connection error: {e}")
    # Создаем заглушку для разработки, чтобы сервер запускался
    redis_client = None

def get_redis():
    """Получение Redis клиента"""
    if redis_client is None:
        raise Exception("Redis not available")
    return redis_client

# Функция для проверки здоровья Redis
def check_redis_health():
    """Проверка доступности Redis"""
    try:
        if redis_client:
            redis_client.ping()
            return True
        return False
    except:
        return False