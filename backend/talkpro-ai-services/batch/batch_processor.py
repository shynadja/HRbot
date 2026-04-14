import time
from typing import List, Dict, Any, Callable, Optional, Tuple
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
import threading
import random

logger = logging.getLogger(__name__)


class BatchProcessor:
    """Обработчик батчей для параллельной обработки данных с защитой от rate limiting"""
    
    def __init__(self, 
                 max_workers: int = 2,
                 batch_size: int = 3,
                 delay_between_batches: float = 3.0,
                 retry_on_failure: bool = True,
                 max_retries: int = 3,
                 rate_limit_delay: float = 2.0):
        """
        Инициализация батч-процессора
        
        Args:
            max_workers: Максимальное количество параллельных worker'ов
            batch_size: Размер батча
            delay_between_batches: Задержка между батчами (секунды)
            retry_on_failure: Повторять ли при ошибках
            max_retries: Максимальное количество повторных попыток
            rate_limit_delay: Начальная задержка при rate limiting
        """
        self.max_workers = max_workers
        self.batch_size = batch_size
        self.delay_between_batches = delay_between_batches
        self.retry_on_failure = retry_on_failure
        self.max_retries = max_retries
        self.rate_limit_delay = rate_limit_delay
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self._stats = {
            'total_processed': 0,
            'batches_processed': 0,
            'total_time': 0,
            'errors': 0,
            'retries': 0,
            'rate_limits': 0,
            'cache_hits': 0
        }
        self._lock = threading.Lock()
    
    def _save_to_cache(self, cache_manager, item: Dict[str, Any], result: Dict[str, Any], agent_type: str) -> bool:
        """
        Универсальное сохранение в кэш (поддерживает оба интерфейса)
        
        Args:
            cache_manager: Менеджер кэша
            item: Исходные данные
            result: Результат для сохранения
            agent_type: Тип агента
            
        Returns:
            True если сохранение успешно, False в противном случае
        """
        if not cache_manager or not result or 'error' in result:
            return False
        
        try:
            # Проверяем, какой интерфейс у cache_manager
            if hasattr(cache_manager, 'set_by_key'):
                if 'context_id' in result:
                    # Пытаемся использовать контекстный метод
                    if hasattr(cache_manager, 'set_by_context'):
                        cache_manager.set_by_context(result['context_id'], agent_type, result)
                    else:
                        key = f"{result['context_id']}_{agent_type}"
                        cache_manager.set_by_key(key, result)
                else:
                    # Создаем ключ на основе ID
                    key = f"{item.get('idCv', '')}_{item.get('idVacancy', '')}_{agent_type}"
                    cache_manager.set_by_key(key, result)
            
            elif hasattr(cache_manager, 'set'):
                cache_manager.set(item, result, agent_type)
            
            else:
                logger.warning(f"Cache manager has no known set method: {type(cache_manager)}")
                return False
            
            return True
            
        except Exception as e:
            logger.debug(f"Error saving to cache: {e}")
            return False
    
    def _get_from_cache(self, cache_manager, item: Dict[str, Any], agent_type: str) -> Optional[Dict[str, Any]]:
        """
        Универсальное получение из кэша (поддерживает оба интерфейса)
        
        Args:
            cache_manager: Менеджер кэша
            item: Исходные данные
            agent_type: Тип агента
            
        Returns:
            Закэшированный результат или None
        """
        if not cache_manager:
            return None
        
        try:
            # Проверяем, какой интерфейс у cache_manager
            if hasattr(cache_manager, 'get_by_key'):
                key = f"{item.get('idCv', '')}_{item.get('idVacancy', '')}_{agent_type}"
                return cache_manager.get_by_key(key)
            
            elif hasattr(cache_manager, 'get'):
                return cache_manager.get(item, agent_type)
            
            else:
                logger.warning(f"Cache manager has no known get method: {type(cache_manager)}")
                return None
                
        except Exception as e:
            logger.debug(f"Error checking cache: {e}")
            return None
    
    def _process_with_retry(self, processor_func: Callable, item: Dict[str, Any], 
                           attempt: int = 1) -> Tuple[Optional[Dict[str, Any]], bool, str]:
        """
        Обработка элемента с повторными попытками при ошибках
        
        Args:
            processor_func: Функция обработки
            item: Элемент данных
            attempt: Номер попытки
            
        Returns:
            Кортеж (результат, успешно_ли, сообщение_об_ошибке)
        """
        try:
            result = processor_func(item)
            return result, True, ""
        except Exception as e:
            error_msg = str(e)
            
            # Проверяем на rate limiting
            if '429' in error_msg or 'Rate limited' in error_msg:
                with self._lock:
                    self._stats['rate_limits'] += 1
                
                if attempt < self.max_retries:
                    # Экспоненциальная задержка с джиттером
                    wait_time = self.rate_limit_delay * (2 ** (attempt - 1)) + random.uniform(0, 1)
                    logger.warning(f"Rate limited (429) on attempt {attempt}. Waiting {wait_time:.1f}s...")
                    time.sleep(wait_time)
                    return self._process_with_retry(processor_func, item, attempt + 1)
                else:
                    error_msg = f"Rate limited after {self.max_retries} attempts"
                    logger.error(error_msg)
                    return None, False, error_msg
            
            # Другие ошибки
            elif self.retry_on_failure and attempt < self.max_retries:
                logger.warning(f"Error on attempt {attempt}: {error_msg}. Retrying in 2s...")
                time.sleep(2)
                return self._process_with_retry(processor_func, item, attempt + 1)
            else:
                logger.error(f"Error processing item after {attempt} attempts: {error_msg}")
                return None, False, error_msg
    
    def process_batch(self, 
                    items: List[Dict[str, Any]], 
                    processor_func: Callable,
                    use_cache: bool = True,
                    cache_manager: Optional[Any] = None,
                    agent_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Обработка батча элементов с защитой от rate limiting
        
        Args:
            items: Список элементов для обработки
            processor_func: Функция для обработки одного элемента
            use_cache: Использовать ли кэш
            cache_manager: Менеджер кэша
            agent_type: Тип агента для кэширования
            
        Returns:
            Список результатов
        """
        start_time = time.time()
        results = [None] * len(items)
        
        # Проверяем кэш для каждого элемента
        cache_hits = 0
        if use_cache and cache_manager and agent_type:
            for i, item in enumerate(items):
                try:
                    cached_result = self._get_from_cache(cache_manager, item, agent_type)
                    if cached_result:
                        results[i] = cached_result
                        cache_hits += 1
                        logger.debug(f"Cache hit for item {i} for agent {agent_type}")
                except Exception as e:
                    logger.debug(f"Cache check error for item {i}: {e}")
        
        with self._lock:
            self._stats['cache_hits'] += cache_hits
        
        logger.info(f"Cache hits: {cache_hits}/{len(items)} for agent {agent_type}")
        
        # Определяем элементы, которые нужно обработать
        to_process = []
        to_process_indices = []
        for i, item in enumerate(items):
            if results[i] is None:
                to_process.append(item)
                to_process_indices.append(i)
        
        if not to_process:
            logger.info(f"All items found in cache for agent {agent_type}")
            return results
        
        logger.info(f"Processing {len(to_process)} items in batches of {self.batch_size} for agent {agent_type}")
        
        # Для мультиагента используем последовательную обработку
        if agent_type == "multi_agent" or agent_type == "multi_agent_v2":
            logger.info(f"Using sequential processing for {agent_type} to avoid rate limiting")
            return self._process_sequential(to_process, to_process_indices, processor_func, 
                                           use_cache, cache_manager, agent_type, items, results)
        
        # Для остальных случаев - параллельная обработка
        return self._process_parallel(to_process, to_process_indices, processor_func,
                                     use_cache, cache_manager, agent_type, items, results, start_time)
    
    def _process_sequential(self, to_process: List[Dict], to_process_indices: List[int],
                           processor_func: Callable, use_cache: bool, cache_manager: Any,
                           agent_type: str, original_items: List[Dict], results: List) -> List[Dict]:
        """
        Последовательная обработка элементов (для мультиагента)
        
        Args:
            to_process: Список элементов для обработки
            to_process_indices: Индексы элементов
            processor_func: Функция обработки
            use_cache: Использовать кэш
            cache_manager: Менеджер кэша
            agent_type: Тип агента
            original_items: Оригинальный список всех элементов
            results: Текущие результаты
            
        Returns:
            Обновленный список результатов
        """
        total = len(to_process)
        
        for idx, (item, original_idx) in enumerate(zip(to_process, to_process_indices)):
            logger.info(f"Sequential processing item {idx+1}/{total} for {agent_type}")
            
            # Обрабатываем элемент с повторными попытками
            result, success, error_msg = self._process_with_retry(processor_func, item)
            
            if success and result:
                results[original_idx] = result
                
                # Сохраняем в кэш
                if use_cache and cache_manager and agent_type and 'error' not in result:
                    self._save_to_cache(cache_manager, original_items[original_idx], result, agent_type)
                
                with self._lock:
                    self._stats['total_processed'] += 1
            else:
                # Создаем результат с ошибкой
                error_result = {
                    'error': error_msg or 'Unknown error',
                    'idCv': item.get('idCv'),
                    'idVacancy': item.get('idVacancy'),
                    'agent': agent_type
                }
                results[original_idx] = error_result
                
                with self._lock:
                    self._stats['errors'] += 1
            
            # Задержка между запросами (кроме последнего)
            if idx < total - 1:
                delay = 3.0  # 3 секунды между запросами
                logger.info(f"Waiting {delay}s before next request...")
                time.sleep(delay)
        
        return results
    
    def _process_parallel(self, to_process: List[Dict], to_process_indices: List[int],
                         processor_func: Callable, use_cache: bool, cache_manager: Any,
                         agent_type: str, original_items: List[Dict], results: List,
                         start_time: float) -> List[Dict]:
        """
        Параллельная обработка элементов (для обычных случаев)
        
        Args:
            to_process: Список элементов для обработки
            to_process_indices: Индексы элементов
            processor_func: Функция обработки
            use_cache: Использовать кэш
            cache_manager: Менеджер кэша
            agent_type: Тип агента
            original_items: Оригинальный список всех элементов
            results: Текущие результаты
            start_time: Время начала обработки
            
        Returns:
            Обновленный список результатов
        """
        # Разбиваем на подбатчи
        for i in range(0, len(to_process), self.batch_size):
            batch = to_process[i:i + self.batch_size]
            batch_indices = to_process_indices[i:i + self.batch_size]
            
            logger.info(f"Processing parallel batch {i//self.batch_size + 1}, size: {len(batch)} for {agent_type}")
            
            # Запускаем параллельную обработку
            futures: Dict[Future, int] = {}
            for j, item in enumerate(batch):
                # Небольшая задержка между запусками
                if j > 0:
                    time.sleep(0.3)
                future = self.executor.submit(self._process_with_retry, processor_func, item)
                futures[future] = batch_indices[j]
            
            # Собираем результаты
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    result, success, error_msg = future.result(timeout=120)
                    
                    if success and result:
                        results[idx] = result
                        
                        # Сохраняем в кэш
                        if use_cache and cache_manager and agent_type and 'error' not in result:
                            self._save_to_cache(cache_manager, original_items[idx], result, agent_type)
                        
                        with self._lock:
                            self._stats['total_processed'] += 1
                    else:
                        # Обработка неуспешного результата
                        error_result = {
                            'error': error_msg or 'Processing failed',
                            'idCv': original_items[idx].get('idCv'),
                            'idVacancy': original_items[idx].get('idVacancy'),
                            'agent': agent_type
                        }
                        results[idx] = error_result
                        
                        with self._lock:
                            self._stats['errors'] += 1
                            
                except Exception as e:
                    error_msg = str(e)
                    logger.error(f"Future error for item {idx}: {error_msg}")
                    results[idx] = {
                        'error': error_msg,
                        'idCv': original_items[idx].get('idCv'),
                        'idVacancy': original_items[idx].get('idVacancy'),
                        'agent': agent_type
                    }
                    with self._lock:
                        self._stats['errors'] += 1
            
            # Задержка между батчами
            if i + self.batch_size < len(to_process):
                logger.info(f"Waiting {self.delay_between_batches}s before next batch...")
                time.sleep(self.delay_between_batches)
        
        # Обновляем статистику
        elapsed_time = time.time() - start_time
        with self._lock:
            self._stats['batches_processed'] += 1
            self._stats['total_time'] += elapsed_time
        
        return results
    
    def get_statistics(self) -> Dict[str, Any]:
        """Получение статистики процессора"""
        with self._lock:
            stats_copy = self._stats.copy()
            total = stats_copy['total_processed'] + stats_copy['errors']
            if total > 0:
                stats_copy['success_rate'] = (stats_copy['total_processed'] / total * 100) if total > 0 else 0
            else:
                stats_copy['success_rate'] = 0
            
            if stats_copy['batches_processed'] > 0:
                stats_copy['avg_time_per_batch'] = stats_copy['total_time'] / stats_copy['batches_processed']
            else:
                stats_copy['avg_time_per_batch'] = 0
            
            return stats_copy
    
    def shutdown(self):
        """Завершение работы процессора"""
        self.executor.shutdown(wait=True)
        logger.info("Batch processor shutdown")