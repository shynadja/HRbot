import json
import hashlib
import time
import logging
from typing import Any, Dict, Optional
import redis

logger = logging.getLogger(__name__)


class RedisCacheManager:
    """
    Менеджер кэширования на Redis для хранения результатов агентов
    """
    
    def __init__(self, 
                 redis_url: str = "redis://localhost:6379",
                 prefix: str = "cache",
                 default_ttl: int = 86400):
        """
        Инициализация Redis кэш-менеджера
        
        Args:
            redis_url: URL для подключения к Redis
            prefix: Префикс для ключей
            default_ttl: Время жизни по умолчанию (секунды)
        """
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.prefix = prefix
        self.default_ttl = default_ttl
        self.stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'expired': 0
        }
        
        logger.info(f"RedisCacheManager initialized with prefix '{prefix}'")
    
    def _make_key(self, key: str) -> str:
        """Формирование ключа с префиксом"""
        return f"{self.prefix}:{key}"
    
    def get_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Получение записи по ключу
        
        Args:
            key: Ключ кэша
            
        Returns:
            Закэшированные данные или None
        """
        full_key = self._make_key(key)
        
        try:
            data = self.redis_client.get(full_key)
            if data:
                self.stats['hits'] += 1
                logger.debug(f"Cache hit: {full_key}")
                return json.loads(data)
            else:
                self.stats['misses'] += 1
                logger.debug(f"Cache miss: {full_key}")
                return None
        except Exception as e:
            logger.error(f"Error reading cache: {e}")
            self.stats['misses'] += 1
            return None
    
    def set_by_key(self, key: str, data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """
        Сохранение записи по ключу
        
        Args:
            key: Ключ кэша
            data: Данные для сохранения
            ttl: Время жизни (если None, используется default_ttl)
        """
        full_key = self._make_key(key)
        ttl = ttl or self.default_ttl
        
        try:
            self.redis_client.setex(
                full_key,
                ttl,
                json.dumps(data, ensure_ascii=False, default=str)
            )
            self.stats['sets'] += 1
            logger.debug(f"Cached: {full_key}")
        except Exception as e:
            logger.error(f"Error writing cache: {e}")
    
    def get_by_context(self, context_id: str, agent_name: str) -> Optional[Dict[str, Any]]:
        """Получение результата агента по ID контекста"""
        key = f"{context_id}_{agent_name}"
        return self.get_by_key(key)
    
    def set_by_context(self, context_id: str, agent_name: str, data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """Сохранение результата агента по ID контекста"""
        key = f"{context_id}_{agent_name}"
        self.set_by_key(key, data, ttl)
    
    def invalidate_by_prefix(self, prefix: str) -> int:
        """Инвалидация кэша по префиксу"""
        # Формируем паттерн для поиска ключей
        # Если prefix пустой, используем наш префикс
        if not prefix:
            pattern = f"{self.prefix}:*"
        else:
            pattern = f"{self.prefix}:{prefix}*"
        
        count = 0
        
        try:
            # Получаем все ключи по паттерну
            keys = self.redis_client.keys(pattern)
            if keys:
                count = len(keys)
                self.redis_client.delete(*keys)
                logger.info(f"Invalidated {count} cache entries with pattern '{pattern}'")
            else:
                logger.info(f"No cache entries found with pattern '{pattern}'")
        except Exception as e:
            logger.error(f"Error invalidating cache: {e}")
        
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """Получение статистики кэша"""
        total_requests = self.stats['hits'] + self.stats['misses']
        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'sets': self.stats['sets'],
            'expired': self.stats['expired'],
            'hit_rate': (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0,
            'cache_dir': f"redis:{self.prefix}"
        }
    
    def clear_expired(self) -> int:
        """
        Очистка устаревших записей (Redis автоматически удаляет по TTL)
        Но можно принудительно проверить и удалить
        """
        # В Redis записи удаляются автоматически по TTL
        # Этот метод оставлен для совместимости
        return 0
    
    def clear_all(self) -> int:
        """Очистка всех ключей с префиксом"""
        pattern = f"{self.prefix}:*"
        count = 0
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                count = len(keys)
                self.redis_client.delete(*keys)
                logger.info(f"Cleared all {count} cache entries with prefix '{self.prefix}'")
        except Exception as e:
            logger.error(f"Error clearing cache: {e}")
        
        return count