from typing import List, Dict, Any, Tuple, Optional
import asyncio
import numpy as np
from app.core.gigachat_client import GigachatClient
from app.services.evaluation_cache import EvaluationCacheService
import logging

logger = logging.getLogger(__name__)

class ResumeAnalyzer:
    def __init__(self):
        self.gigachat = GigachatClient()
        self.cache_service = EvaluationCacheService()
    
    async def quick_rank_candidates(
        self, 
        query: str, 
        query_embedding: np.ndarray,
        candidates: List[Dict[str, Any]]
    ) -> List[Tuple[int, float, Optional[Dict]]]:
        """
        Быстрое ранжирование кандидатов с использованием кеша
        Возвращает список (индекс, оценка, данные из кеша)
        """
        if not candidates:
            return []
        
        # Собираем ID кандидатов
        candidate_ids = [c.get('id') for c in candidates if c.get('id')]
        
        # Ищем кешированные оценки
        cached_results = {}
        if candidate_ids:
            cached_results = await self.cache_service.find_cached_evaluations_batch(
                candidate_ids, query, query_embedding, require_deep=False
            )
        
        # Формируем список для оценки
        results = []
        candidates_to_evaluate = []
        indices_to_evaluate = []
        
        for idx, candidate in enumerate(candidates):
            candidate_id = candidate.get('id')
            
            # Если есть кеш, используем его
            if candidate_id and candidate_id in cached_results:
                cache = cached_results[candidate_id]
                score = cache.get('quick_score', 75)
                results.append((idx, score, cache))
                logger.info(f"Using cached quick score for candidate {candidate_id}: {score}")
            else:
                # Нужно оценить
                candidates_to_evaluate.append(candidate)
                indices_to_evaluate.append(idx)
        
        # Оцениваем недостающих кандидатов
        if candidates_to_evaluate:
            resumes = [c.get('resume_text', '') for c in candidates_to_evaluate]
            scores = await self.gigachat.compare_candidates_quick(query, resumes)
            
            # Сохраняем в кеш
            for i, (orig_idx, score) in enumerate(zip(indices_to_evaluate, scores)):
                candidate = candidates[orig_idx]
                candidate_id = candidate.get('id')
                
                if candidate_id:
                    # Сохраняем быструю оценку
                    eval_data = {'quick_score': score, 'score': score}
                    await self.cache_service.save_evaluation(
                        candidate_id, query, query_embedding, eval_data, 'quick'
                    )
                
                results.append((orig_idx, score, None))
                
                # Небольшая задержка между запросами
                await asyncio.sleep(0.1)
        
        # Сортируем по убыванию оценки
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results
    
    async def deep_analyze_candidates(
        self,
        query: str,
        query_embedding: np.ndarray,
        candidates: List[Dict[str, Any]],
        top_indices: List[int]
    ) -> Dict[int, Dict[str, Any]]:
        """
        Глубокий анализ выбранных кандидатов с использованием кеша
        """
        results = {}
        candidates_to_analyze = []
        indices_to_analyze = []
        
        # Проверяем кеш для топ-кандидатов
        for idx in top_indices:
            candidate = candidates[idx]
            candidate_id = candidate.get('id')
            
            if candidate_id:
                # Ищем глубокую оценку в кеше
                cached = await self.cache_service.find_cached_evaluation(
                    candidate_id, query, query_embedding, 
                    similarity_threshold=0.9, require_deep=True
                )
                
                if cached and cached.get('score') is not None:
                    logger.info(f"Using cached deep analysis for candidate {candidate_id}")
                    results[idx] = cached
                    continue
            
            # Нужно проанализировать
            candidates_to_analyze.append(candidate)
            indices_to_analyze.append(idx)
        
        # Анализируем недостающих
        if candidates_to_analyze:
            for i, (orig_idx, candidate) in enumerate(zip(indices_to_analyze, candidates_to_analyze)):
                resume_text = candidate.get('resume_text', '')
                candidate_id = candidate.get('id')
                
                logger.info(f"Deep analyzing candidate {orig_idx+1}" + 
                          (f" (ID: {candidate_id})" if candidate_id else ""))
                
                # Глубокий анализ
                analysis = await self.gigachat.deep_analyze(resume_text, query)
                
                # Сохраняем в кеш
                if candidate_id:
                    await self.cache_service.save_evaluation(
                        candidate_id, query, query_embedding, analysis, 'deep'
                    )
                
                results[orig_idx] = analysis
                
                # Небольшая задержка между анализами
                await asyncio.sleep(0.5)
        
        return results
    
    async def analyze_single_deep(
        self,
        query: str,
        query_embedding: np.ndarray,
        candidate: Dict[str, Any],
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Глубокий анализ одного кандидата с проверкой кеша
        """
        candidate_id = candidate.get('id')
        
        if use_cache and candidate_id:
            # Проверяем кеш
            cached = await self.cache_service.find_cached_evaluation(
                candidate_id, query, query_embedding, require_deep=True
            )
            if cached:
                logger.info(f"Using cached deep analysis for candidate {candidate_id}")
                return cached
        
        # Анализируем
        resume_text = candidate.get('resume_text', '')
        analysis = await self.gigachat.deep_analyze(resume_text, query)
        
        # Сохраняем в кеш
        if candidate_id:
            await self.cache_service.save_evaluation(
                candidate_id, query, query_embedding, analysis, 'deep'
            )
        
        return analysis
    
    def merge_analysis_with_candidate(
        self,
        candidate: Dict[str, Any],
        analysis: Dict[str, Any],
        quick_score: float = None
    ) -> Dict[str, Any]:
        """
        Объединение данных кандидата с результатами анализа
        """
        result = candidate.copy()
        
        # Быстрая оценка
        if quick_score:
            result['quick_score'] = quick_score
        
        # Результаты анализа (приоритет глубокого анализа)
        result['score'] = analysis.get('score', quick_score or 75)
        result['strengths'] = analysis.get('strengths', [])
        result['weaknesses'] = analysis.get('weaknesses', [])
        result['ai_detection'] = analysis.get('ai_detection', {})
        result['key_skills'] = analysis.get('key_skills', [])
        result['experience_analysis'] = analysis.get('experience_analysis', '')
        result['recommendation'] = analysis.get('recommendation', '')
        result['detailed_analysis'] = analysis.get('detailed_analysis', {})
        
        # Добавляем информацию о кеше
        if 'cache_id' in analysis:
            result['cache_id'] = analysis['cache_id']
            result['cached'] = True
        
        return result