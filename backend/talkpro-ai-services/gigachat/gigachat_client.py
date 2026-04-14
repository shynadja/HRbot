"""
Единый унифицированный клиент GigaChat API
- Поддержка батчинга и кэширования (из Gateway)
- Реальный подсчет токенов (из Direct Client)
- Rate limiting и retry
- Синхронная обертка для совместимости с агентами
"""

import asyncio
import json
import time
import hashlib
import logging
from typing import Dict, Any, Optional, List, Tuple
from collections import defaultdict
import httpx
import base64
import uuid
import threading

logger = logging.getLogger(__name__)


class GigaChatClient:
    """
    Единый клиент GigaChat с:
    - Батчингом запросов
    - Кэшированием (Redis или in-memory)
    - Реальным подсчетом токенов
    - Rate limiting
    - Retry с exponential backoff
    - Синхронной оберткой для совместимости
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern для клиента"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(
        self,
        api_key: str = None,
        client_id: str = None,
        auth_key: str = None,
        base_url: str = "https://gigachat.devices.sberbank.ru/api/v1",
        model: str = "GigaChat-Pro",
        max_rps: int = 10,
        batch_window: float = 0.1,
        max_batch_size: int = 10,
        cache_ttl: int = 86400,
        use_redis: bool = True,
        redis_url: str = "redis://localhost:6379",
        enable_batching: bool = False,  # Отключаем батчинг по умолчанию для синхронного режима
        enable_cache: bool = True
    ):
        # Предотвращаем повторную инициализацию
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        
        # Загрузка из переменных окружения если не переданы
        import os
        if not api_key:
            api_key = os.getenv("GIGACHAT_API_KEY")
        if not client_id:
            client_id = os.getenv("GIGACHAT_CLIENT_ID")
        if not auth_key:
            auth_key = os.getenv("GIGACHAT_AUTH_KEY")
        
        # Инициализация аутентификации
        self.api_key = api_key
        self.client_id = client_id
        self.auth_key = auth_key
        self.base_url = base_url
        self.model = model
        
        # Настройки
        self.max_rps = max_rps
        self.batch_window = batch_window
        self.max_batch_size = max_batch_size
        self.cache_ttl = cache_ttl
        self.enable_batching = enable_batching
        self.enable_cache = enable_cache
        
        # HTTP клиент (создаем один раз)
        self.client = None
        self._loop = None
        
        # Токен доступа
        self.access_token = None
        self.token_expires_at = 0
        
        # Rate limiting
        self._rate_limit_lock = threading.Lock()
        self._last_request_time = 0
        self._min_interval = 1.0 / max_rps
        
        # Кэш
        self.use_redis = use_redis
        self.redis = None
        self.cache: Dict[str, Tuple[float, dict]] = {}
        
        if enable_cache and use_redis:
            try:
                import redis
                self.redis = redis.from_url(redis_url, decode_responses=True)
                self.redis.ping()
                logger.info(f"Connected to Redis at {redis_url}")
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}, using in-memory cache")
                self.use_redis = False
        
        # Статистика токенов
        self.token_stats = {
            'total_tokens': 0,
            'prompt_tokens': 0,
            'completion_tokens': 0,
            'requests_count': 0,
            'cache_hits': 0,
            'api_calls': 0,
            'errors': 0
        }
        
        logger.info(f"GigaChatClient initialized (model={model}, cache={enable_cache}, redis={use_redis})")
    
    def _get_or_create_loop(self):
        """Получение или создание event loop для синхронных вызовов"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop
    
    def _get_sync_client(self) -> httpx.Client:
        """Получение синхронного HTTP клиента"""
        if not hasattr(self, '_sync_client') or self._sync_client is None:
            self._sync_client = httpx.Client(timeout=60.0, verify=False)
        return self._sync_client
    
    # ========== Аутентификация ==========
    
    def _get_access_token_sync(self) -> str:
        """Синхронное получение токена доступа"""
        if self.access_token and time.time() < self.token_expires_at:
            return self.access_token
        
        # Подготовка аутентификации
        if self.api_key:
            auth = base64.b64encode(f"{self.api_key}:".encode()).decode()
        elif self.client_id and self.auth_key:
            auth = self.auth_key
        else:
            raise ValueError("Either api_key or (client_id + auth_key) must be provided")
        
        rquid = str(uuid.uuid4())
        headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
            "RqUID": rquid,
            "Accept": "application/json"
        }
        data = {"scope": "GIGACHAT_API_PERS"}
        
        try:
            client = self._get_sync_client()
            resp = client.post(
                "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
                headers=headers,
                data=data,
                timeout=30
            )
            resp.raise_for_status()
            token_data = resp.json()
            self.access_token = token_data["access_token"]
            self.token_expires_at = time.time() + token_data.get("expires_in", 3600)
            logger.debug("Access token obtained")
            return self.access_token
        except Exception as e:
            logger.error(f"Failed to get access token: {e}")
            raise
    
    # ========== Кэш ==========
    
    def _cache_get(self, key: str) -> Optional[Dict]:
        """Получение из кэша"""
        if not self.enable_cache:
            return None
        
        if self.use_redis and self.redis:
            try:
                data = self.redis.get(key)
                return json.loads(data) if data else None
            except Exception as e:
                logger.warning(f"Redis get error: {e}")
                return None
        else:
            entry = self.cache.get(key)
            if entry:
                timestamp, value = entry
                if time.time() - timestamp < self.cache_ttl:
                    return value
                else:
                    del self.cache[key]
            return None
    
    def _cache_set(self, key: str, value: Dict):
        """Сохранение в кэш"""
        if not self.enable_cache:
            return
        
        if self.use_redis and self.redis:
            try:
                self.redis.setex(key, self.cache_ttl, json.dumps(value, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Redis set error: {e}")
        else:
            self.cache[key] = (time.time(), value)
    
    # ========== Rate Limiting ==========
    
    def _rate_limit_wait(self):
        """Ожидание для соблюдения rate limit"""
        with self._rate_limit_lock:
            now = time.time()
            time_since_last = now - self._last_request_time
            if time_since_last < self._min_interval:
                time.sleep(self._min_interval - time_since_last)
            self._last_request_time = time.time()
    
    # ========== Синхронный метод analyze (основной) ==========
    
    def analyze(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 2000,
        use_cache: bool = True
    ) -> Tuple[Dict[str, Any], Dict[str, int]]:
        """
        Синхронный метод анализа с подсчетом токенов
        
        Returns:
            Tuple[result, token_usage]
        """
        # Генерация ключа кэша
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
        cache_key = f"gigachat:{prompt_hash}"
        
        # Проверка кэша
        if use_cache and self.enable_cache:
            cached = self._cache_get(cache_key)
            if cached:
                self.token_stats['cache_hits'] += 1
                self.token_stats['requests_count'] += 1
                logger.debug(f"Cache hit for prompt hash {prompt_hash[:8]}")
                return cached, {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'from_cache': True}
        
        # Применяем rate limiting
        self._rate_limit_wait()
        
        # Выполняем запрос с retry
        result, token_usage = self._call_api_with_retry_sync(
            prompt, temperature, max_tokens
        )
        
        # Обновляем статистику
        self.token_stats['api_calls'] += 1
        self.token_stats['requests_count'] += 1
        self.token_stats['total_tokens'] += token_usage.get('total_tokens', 0)
        self.token_stats['prompt_tokens'] += token_usage.get('prompt_tokens', 0)
        self.token_stats['completion_tokens'] += token_usage.get('completion_tokens', 0)
        
        if 'error' in result:
            self.token_stats['errors'] += 1
        
        # Сохраняем в кэш (только успешные результаты)
        if use_cache and self.enable_cache and 'error' not in result:
            self._cache_set(cache_key, result)
        
        return result, token_usage
    
    def _call_api_with_retry_sync(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 2000,
        max_retries: int = 3
    ) -> Tuple[Dict, Dict]:
        """Синхронный вызов API с повторными попытками"""
        
        for attempt in range(max_retries):
            try:
                token = self._get_access_token_sync()
                client = self._get_sync_client()
                
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    }
                )
                
                if response.status_code == 429:
                    wait_time = 2 ** attempt
                    logger.warning(f"Rate limited (429), waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                
                if response.status_code == 401:
                    logger.warning("Token expired, refreshing...")
                    self.access_token = None
                    token = self._get_access_token_sync()
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                # Извлекаем реальные токены из ответа API
                token_usage = data.get('usage', {})
                
                # Fallback если нет данных о токенах
                if not token_usage:
                    content = data['choices'][0]['message']['content']
                    token_usage = {
                        'prompt_tokens': len(prompt) // 4,
                        'completion_tokens': len(content) // 4,
                        'total_tokens': (len(prompt) + len(content)) // 4
                    }
                
                logger.debug(f"API call successful, tokens: {token_usage.get('total_tokens', 0)}")
                return data, token_usage
                
            except Exception as e:
                logger.warning(f"API call attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"API call failed after {max_retries} attempts")
                    return {'error': str(e)}, {'total_tokens': 0}
                time.sleep(2 ** attempt)
        
        return {'error': 'Max retries exceeded'}, {'total_tokens': 0}
    
    # ========== Асинхронные методы (для совместимости) ==========
    
    async def analyze_async(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 2000,
        use_cache: bool = True
    ) -> Tuple[Dict[str, Any], Dict[str, int]]:
        """Асинхронная версия analyze"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.analyze, prompt, temperature, max_tokens, use_cache
        )
    
    async def analyze_with_prompt(self, prompt_key: str, text: str, **kwargs) -> Dict[str, Any]:
        """Анализ текста по ключу промпта"""
        from .prompts import ANALYSIS_PROMPTS
        
        if prompt_key not in ANALYSIS_PROMPTS:
            raise ValueError(f"Unknown prompt key: {prompt_key}")
        
        prompt = ANALYSIS_PROMPTS[prompt_key].format(text=text, **kwargs)
        result, _ = await self.analyze_async(prompt)
        return result
    
    def embeddings(self, text: str, model: str = "Embeddings") -> Dict[str, Any]:
        """
        Получение эмбеддинга через GigaChat Embeddings API
        
        Args:
            text: Текст для эмбеддинга
            model: Модель для эмбеддингов (по умолчанию "Embeddings")
            
        Returns:
            Словарь с эмбеддингом в формате {"data": [{"embedding": [...]}]}
        """
        try:
            token = self._get_access_token_sync()
            client = self._get_sync_client()
            
            response = client.post(
                f"{self.base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "input": text[:8000]  # Ограничение на длину текста
                }
            )
            
            if response.status_code == 401:
                logger.warning("Token expired for embeddings, refreshing...")
                self.access_token = None
                token = self._get_access_token_sync()
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={"model": model, "input": text[:8000]}
                )
            
            response.raise_for_status()
            data = response.json()
            logger.debug(f"Got embedding from GigaChat, dimension: {len(data.get('data', [{}])[0].get('embedding', []))}")
            return data
            
        except Exception as e:
            logger.warning(f"Failed to get embedding from GigaChat: {e}")
            # Fallback: возвращаем заглушку
            return {"data": [{"embedding": []}]}
    
    # ========== Статистика и управление ==========
    
    def get_token_stats(self) -> Dict[str, Any]:
        """Получение статистики токенов"""
        stats = self.token_stats.copy()
        if stats['requests_count'] > 0:
            stats['cache_hit_rate'] = (stats['cache_hits'] / stats['requests_count']) * 100
        else:
            stats['cache_hit_rate'] = 0
        return stats
    
    def get_stats(self) -> Dict[str, Any]:
        """Полная статистика"""
        return {
            **self.get_token_stats(),
            'cache_enabled': self.enable_cache,
            'use_redis': self.use_redis,
            'max_rps': self.max_rps,
            'model': self.model
        }
    
    def reset_token_stats(self):
        """Сброс статистики токенов"""
        self.token_stats = {
            'total_tokens': 0,
            'prompt_tokens': 0,
            'completion_tokens': 0,
            'requests_count': 0,
            'cache_hits': 0,
            'api_calls': 0,
            'errors': 0
        }
        logger.info("Token stats reset")
    
    def clear_cache(self):
        """Очистка кэша"""
        if self.use_redis and self.redis:
            try:
                keys = self.redis.keys("gigachat:*")
                if keys:
                    self.redis.delete(*keys)
                logger.info(f"Cleared {len(keys)} cache entries from Redis")
            except Exception as e:
                logger.error(f"Error clearing Redis cache: {e}")
        else:
            count = len(self.cache)
            self.cache.clear()
            logger.info(f"Cleared {count} cache entries from memory")
    
    def close(self):
        """Закрытие клиента"""
        if hasattr(self, '_sync_client') and self._sync_client:
            self._sync_client.close()
            self._sync_client = None
        
        if self.use_redis and self.redis:
            try:
                self.redis.close()
            except:
                pass
        
        logger.info("GigaChatClient closed")