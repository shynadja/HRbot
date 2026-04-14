from typing import Dict, Any, Optional, Tuple
import time
import logging
from abc import ABC, abstractmethod

# Импортируем правильный клиент
from gigachat.gigachat_client import GigaChatClient
from cache.redis_cache_manager import RedisCacheManager

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """
    Базовый класс для агентов.
    """
    
    def __init__(self, 
                 agent_name: str,
                 system_prompt: str,
                 api_client: Optional[GigaChatClient] = None,
                 cache_manager: Optional[RedisCacheManager] = None,
                 use_cache: bool = True,
                 efficiency_analyzer: Optional[Any] = None):
        self.agent_name = agent_name
        self.system_prompt = system_prompt
        self.api_client = api_client or GigaChatClient()
        self.cache_manager = cache_manager
        self.use_cache = use_cache
        self.efficiency_analyzer = efficiency_analyzer
        
        logger.info(f"Agent '{agent_name}' initialized")
    
    @abstractmethod
    def build_prompt(self, context) -> str:
        """Построение промпта"""
        pass
    
    @abstractmethod
    def parse_response(self, response: Dict[str, Any], context, token_usage: Optional[Dict] = None) -> Dict[str, Any]:
        """Парсинг ответа - теперь принимает token_usage"""
        pass
    
    def process(self, context) -> Tuple[Dict[str, Any], Dict[str, int]]:
        """
        Обработка с использованием контекста
        
        Returns:
            Tuple[result, token_usage]
        """
        start_time = time.time()
        token_usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}

        # Проверяем, есть ли результат в контексте
        if hasattr(context, 'get_result') and callable(getattr(context, 'get_result')):
            existing_result = context.get_result(self.agent_name)
            if existing_result:
                existing_result['from_cache'] = True
                existing_result['processing_time'] = time.time() - start_time
                if hasattr(context, 'raw_data'):
                    existing_result['idCv'] = context.raw_data.get('idCv')
                    existing_result['idVacancy'] = context.raw_data.get('idVacancy')
                logger.debug(f"Agent '{self.agent_name}' result found in context")
                return existing_result, token_usage

        # Генерируем ключ кэша
        cache_key = None
        if hasattr(context, 'get_cache_key') and callable(getattr(context, 'get_cache_key')):
            try:
                import inspect
                sig = inspect.signature(context.get_cache_key)
                if len(sig.parameters) > 0:
                    cache_key = context.get_cache_key(self.agent_name)
                else:
                    cache_key = context.get_cache_key()
            except:
                cache_key = None
        elif hasattr(context, 'context_id'):
            cache_key = f"{context.context_id}_{self.agent_name}"

        # Проверяем кэш
        if self.use_cache and self.cache_manager and cache_key:
            cached_result = self.cache_manager.get_by_key(cache_key)
            if cached_result:
                cached_result['from_cache'] = True
                cached_result['processing_time'] = time.time() - start_time
            
                if hasattr(context, 'store_result') and callable(getattr(context, 'store_result')):
                    context.store_result(self.agent_name, cached_result)
                
                if self.efficiency_analyzer:
                    self.efficiency_analyzer.log_request(
                        agent_type=self.agent_name,
                        prompt="",
                        response=cached_result,
                        processing_time=time.time() - start_time,
                        from_cache=True,
                        token_usage=token_usage
                    )
            
                return cached_result, token_usage
        
        try:
            # Строим промпт
            prompt = self.build_prompt(context)
        
            # Отправляем запрос к API - используем метод analyze
            api_response, token_usage = self.api_client.analyze(
                prompt,
                temperature=0.1,
                max_tokens=2000
            )
            
            # Проверка на ошибку
            if not isinstance(api_response, dict):
                logger.error(f"Invalid response type: {type(api_response)}")
                error_result = {
                    'error': f'Invalid response type: {type(api_response)}',
                    'agent': self.agent_name,
                    'processing_time': time.time() - start_time,
                    'from_cache': False,
                    'total_tokens': 0
                }
                return error_result, token_usage
        
            # Парсим ответ - передаем token_usage
            result = self.parse_response(api_response, context, token_usage)
            
            processing_time = time.time() - start_time
            
            # Добавляем мета-информацию
            result['processing_time'] = processing_time
            result['agent'] = self.agent_name
            result['from_cache'] = False
            result['total_tokens'] = token_usage.get('total_tokens', 0)
        
            if hasattr(context, 'raw_data'):
                result['idCv'] = context.raw_data.get('idCv')
                result['idVacancy'] = context.raw_data.get('idVacancy')
            
            if hasattr(context, 'context_id'):
                result['context_id'] = context.context_id
        
            # Логируем токены через efficiency_analyzer
            if self.efficiency_analyzer:
                self.efficiency_analyzer.log_request(
                    agent_type=self.agent_name,
                    prompt=prompt,
                    response=result,
                    processing_time=processing_time,
                    from_cache=False,
                    error='error' in result,
                    token_usage=token_usage
                )
        
            # Сохраняем в контекст
            if hasattr(context, 'store_result') and callable(getattr(context, 'store_result')):
                context.store_result(self.agent_name, result)
        
            # Сохраняем в кэш
            if self.use_cache and self.cache_manager and cache_key and 'error' not in result:
                self.cache_manager.set_by_key(cache_key, result, ttl=86400)
            
            return result, token_usage
        
        except Exception as e:
            logger.error(f"Error in agent '{self.agent_name}': {e}")
            error_result = {
                'error': str(e),
                'agent': self.agent_name,
                'processing_time': time.time() - start_time,
                'from_cache': False,
                'total_tokens': 0
            }
        
            if hasattr(context, 'raw_data'):
                error_result['idCv'] = context.raw_data.get('idCv')
                error_result['idVacancy'] = context.raw_data.get('idVacancy')
            
            if hasattr(context, 'context_id'):
                error_result['context_id'] = context.context_id
        
            if hasattr(context, 'store_result') and callable(getattr(context, 'store_result')):
                context.store_result(self.agent_name, error_result)
            
            if self.efficiency_analyzer:
                self.efficiency_analyzer.log_request(
                    agent_type=self.agent_name,
                    prompt="",
                    response=error_result,
                    processing_time=time.time() - start_time,
                    from_cache=False,
                    error=True,
                    token_usage=token_usage
                )
        
            return error_result, token_usage