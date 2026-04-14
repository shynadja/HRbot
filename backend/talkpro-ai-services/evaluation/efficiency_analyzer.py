import logging
import time
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)


class EfficiencyAnalyzer:
    """Анализатор эффективности с подсчетом токенов"""
    
    def __init__(self):
        self.requests_log = []
        self.token_usage_by_agent = defaultdict(lambda: {
            'total_tokens': 0,
            'prompt_tokens': 0,
            'completion_tokens': 0,
            'requests_count': 0,
            'errors_count': 0,
            'cache_hits': 0
        })
        self.start_time = datetime.now()
    
    def log_request(self, 
                    agent_type: str,
                    prompt: str,
                    response: Dict[str, Any],
                    processing_time: float,
                    from_cache: bool = False,
                    error: bool = False,
                    token_usage: Optional[Dict[str, int]] = None):
        """
        Логирование запроса с подсчетом токенов
        """
        # Получаем данные о токенах из ответа или из переданных параметров
        if token_usage:
            prompt_tokens = token_usage.get('prompt_tokens', 0)
            completion_tokens = token_usage.get('completion_tokens', 0)
            total_tokens = token_usage.get('total_tokens', 0)
        else:
            # Fallback: пытаемся извлечь из ответа
            prompt_tokens = response.get('prompt_tokens', 0)
            completion_tokens = response.get('completion_tokens', 0)
            total_tokens = response.get('total_tokens', 0)
        
        # Обновляем статистику по агенту
        stats = self.token_usage_by_agent[agent_type]
        stats['total_tokens'] += total_tokens
        stats['prompt_tokens'] += prompt_tokens
        stats['completion_tokens'] += completion_tokens
        stats['requests_count'] += 1
        
        if from_cache:
            stats['cache_hits'] += 1
        
        if error:
            stats['errors_count'] += 1
        
        # Логируем запрос
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'agent_type': agent_type,
            'processing_time': processing_time,
            'from_cache': from_cache,
            'error': error,
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': total_tokens,
            'prompt_length': len(prompt) if prompt else 0,
            'response_length': len(str(response)) if response else 0
        }
        
        self.requests_log.append(log_entry)
        
        # Ограничиваем размер лога (храним последние 10000 записей)
        if len(self.requests_log) > 10000:
            self.requests_log = self.requests_log[-10000:]
        
        logger.debug(f"Logged request for {agent_type}: {total_tokens} tokens, "
                    f"time={processing_time:.2f}s, cache={from_cache}")
    
    def log_token_usage(self, agent_type: str, token_usage: Dict[str, int]):
        """
        Простой лог использования токенов
        """
        stats = self.token_usage_by_agent[agent_type]
        stats['total_tokens'] += token_usage.get('total_tokens', 0)
        stats['prompt_tokens'] += token_usage.get('prompt_tokens', 0)
        stats['completion_tokens'] += token_usage.get('completion_tokens', 0)
        stats['requests_count'] += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Получение полной статистики
        """
        # Общая статистика по всем агентам
        total_tokens = sum(s['total_tokens'] for s in self.token_usage_by_agent.values())
        total_requests = sum(s['requests_count'] for s in self.token_usage_by_agent.values())
        total_cache_hits = sum(s['cache_hits'] for s in self.token_usage_by_agent.values())
        total_errors = sum(s['errors_count'] for s in self.token_usage_by_agent.values())
        
        # Вычисляем среднее время ответа
        avg_time = 0
        p95_time = 0
        if self.requests_log:
            times = [r['processing_time'] for r in self.requests_log if not r.get('from_cache', False)]
            if times:
                avg_time = sum(times) / len(times)
                sorted_times = sorted(times)
                p95_index = int(len(sorted_times) * 0.95)
                p95_time = sorted_times[p95_index] if p95_index < len(sorted_times) else sorted_times[-1]
        
        # Статистика по каждому агенту
        agents_stats = {}
        for agent, stats in self.token_usage_by_agent.items():
            agents_stats[agent] = {
                'total_tokens': stats['total_tokens'],
                'prompt_tokens': stats['prompt_tokens'],
                'completion_tokens': stats['completion_tokens'],
                'requests_count': stats['requests_count'],
                'errors_count': stats['errors_count'],
                'cache_hits': stats['cache_hits'],
                'cache_hit_rate': (stats['cache_hits'] / stats['requests_count'] * 100) if stats['requests_count'] > 0 else 0,
                'avg_tokens_per_request': stats['total_tokens'] / stats['requests_count'] if stats['requests_count'] > 0 else 0,
                'success_rate': ((stats['requests_count'] - stats['errors_count']) / stats['requests_count'] * 100) if stats['requests_count'] > 0 else 0
            }
        
        return {
            'uptime_seconds': (datetime.now() - self.start_time).total_seconds(),
            'total_requests': total_requests,
            'total_tokens': total_tokens,
            'total_cache_hits': total_cache_hits,
            'total_errors': total_errors,
            'avg_response_time': round(avg_time, 3),
            'p95_response_time': round(p95_time, 3),
            'overall_cache_hit_rate': (total_cache_hits / total_requests * 100) if total_requests > 0 else 0,
            'overall_success_rate': ((total_requests - total_errors) / total_requests * 100) if total_requests > 0 else 0,
            'agents': agents_stats,
            'recent_requests': self.requests_log[-20:]  # Последние 20 запросов
        }
    
    def get_token_cost_estimate(self, price_per_1m_tokens: float = 500.00) -> Dict[str, Any]:
        """
        Оценка стоимости в рублях (по умолчанию 500.00 руб за 1000000 токенов)
        """
        total_tokens = sum(s['total_tokens'] for s in self.token_usage_by_agent.values())
        estimated_cost = (total_tokens / 1000) * price_per_1m_tokens
        
        return {
            'total_tokens': total_tokens,
            'price_per_1k_tokens': price_per_1m_tokens,
            'estimated_cost_rub': round(estimated_cost, 2),
            'estimated_cost_usd': round(estimated_cost / 90, 2)  # примерный курс
        }
    
    def reset(self):
        """Сброс статистики"""
        self.requests_log = []
        self.token_usage_by_agent.clear()
        self.start_time = datetime.now()