import hashlib
import json
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, and_
from app.database import SessionLocal
from app.models import ResumeEvaluationCache, Candidate
from app.config import settings
from app.core.gigachat_client import GigachatClient
import logging

logger = logging.getLogger(__name__)

class EvaluationCacheService:
    def __init__(self):
        self.gigachat = GigachatClient()
        self.cache_days = settings.CANDIDATE_CACHE_DAYS
    
    def _generate_query_hash(self, query: str) -> str:
        """Генерация хеша запроса"""
        return hashlib.sha256(query.encode()).hexdigest()
    
    async def find_cached_evaluation(
        self, 
        candidate_id: int, 
        query: str,
        query_embedding: np.ndarray,
        similarity_threshold: float = 0.85,
        require_deep: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Поиск кешированной оценки для кандидата по похожему запросу
        """
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            
            # Ищем по хешу запроса (точное совпадение)
            query_hash = self._generate_query_hash(query)
            exact_match = db.query(ResumeEvaluationCache).filter(
                and_(
                    ResumeEvaluationCache.candidate_id == candidate_id,
                    ResumeEvaluationCache.query_hash == query_hash,
                    ResumeEvaluationCache.expires_at > now
                )
            ).first()
            
            if exact_match:
                logger.info(f"Found exact cache match for candidate {candidate_id}")
                return self._cache_to_dict(exact_match)
            
            # Ищем по векторному сходству (похожие запросы)
            # Используем pgvector для поиска похожих запросов
            similar_caches = db.execute(
                text("""
                SELECT id, candidate_id, query_hash, quick_score, deep_score,
                       strengths, weaknesses, ai_detection, key_skills,
                       experience_analysis, recommendation, detailed_analysis,
                       evaluation_type, created_at, expires_at,
                       1 - (query_embedding <=> :query_embedding) as similarity
                FROM resume_evaluation_cache
                WHERE candidate_id = :candidate_id
                  AND expires_at > :now
                  AND (1 - (query_embedding <=> :query_embedding)) > :threshold
                ORDER BY query_embedding <=> :query_embedding
                LIMIT 1
                """),
                {
                    'candidate_id': candidate_id,
                    'query_embedding': str(query_embedding.tolist()),
                    'now': now,
                    'threshold': similarity_threshold
                }
            ).fetchone()
            
            if similar_caches:
                similarity = similar_caches[-1]  # последнее поле - similarity
                logger.info(f"Found similar cache match for candidate {candidate_id} with similarity {similarity:.3f}")
                
                # Проверяем, подходит ли тип оценки
                eval_type = similar_caches[12]  # evaluation_type
                if require_deep and eval_type != 'deep' and similar_caches[4] is None:
                    # Нужна глубокая оценка, но есть только быстрая
                    return None
                
                return self._row_to_dict(similar_caches)
            
            return None
            
        finally:
            db.close()
    
    async def find_cached_evaluations_batch(
        self,
        candidate_ids: List[int],
        query: str,
        query_embedding: np.ndarray,
        require_deep: bool = False
    ) -> Dict[int, Dict[str, Any]]:
        """
        Поиск кешированных оценок для нескольких кандидатов
        """
        if not candidate_ids:
            return {}
        
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            ids_str = ','.join(str(id) for id in candidate_ids)
            query_hash = self._generate_query_hash(query)
            
            # Ищем все кеши для этих кандидатов
            results = db.execute(
                text(f"""
                WITH ranked_caches AS (
                    SELECT 
                        id, candidate_id, query_hash, quick_score, deep_score,
                        strengths, weaknesses, ai_detection, key_skills,
                        experience_analysis, recommendation, detailed_analysis,
                        evaluation_type, created_at, expires_at,
                        1 - (query_embedding <=> :query_embedding) as similarity,
                        ROW_NUMBER() OVER (
                            PARTITION BY candidate_id 
                            ORDER BY 
                                CASE 
                                    WHEN query_hash = :exact_hash THEN 1 
                                    ELSE 2 
                                END,
                                query_embedding <=> :query_embedding
                        ) as rn
                    FROM resume_evaluation_cache
                    WHERE candidate_id IN ({ids_str})
                      AND expires_at > :now
                      AND (query_hash = :exact_hash OR 
                           1 - (query_embedding <=> :query_embedding) > 0.8)
                )
                SELECT * FROM ranked_caches WHERE rn = 1
                """),
                {
                    'query_embedding': str(query_embedding.tolist()),
                    'exact_hash': query_hash,
                    'now': now
                }
            ).fetchall()
            
            result_dict = {}
            for row in results:
                candidate_id = row[1]
                eval_type = row[12]
                
                # Проверяем тип оценки
                if require_deep and eval_type != 'deep' and row[4] is None:
                    continue
                
                result_dict[candidate_id] = self._row_to_dict(row)
            
            return result_dict
            
        finally:
            db.close()
    
    async def save_evaluation(
        self,
        candidate_id: int,
        query: str,
        query_embedding: np.ndarray,
        evaluation: Dict[str, Any],
        evaluation_type: str = 'quick'
    ):
        """
        Сохранение оценки в кеш
        """
        db = SessionLocal()
        try:
            query_hash = self._generate_query_hash(query)
            now = datetime.utcnow()
            expires_at = now + timedelta(days=self.cache_days)
            
            # Проверяем, есть ли уже такая запись
            existing = db.query(ResumeEvaluationCache).filter(
                and_(
                    ResumeEvaluationCache.candidate_id == candidate_id,
                    ResumeEvaluationCache.query_hash == query_hash
                )
            ).first()
            
            if existing:
                # Обновляем существующую
                if evaluation_type == 'deep' or (
                    evaluation_type == 'quick' and existing.deep_score is None
                ):
                    existing.quick_score = evaluation.get('quick_score', evaluation.get('score'))
                    if evaluation_type == 'deep':
                        existing.deep_score = evaluation.get('score')
                        existing.strengths = evaluation.get('strengths')
                        existing.weaknesses = evaluation.get('weaknesses')
                        existing.ai_detection = evaluation.get('ai_detection')
                        existing.key_skills = evaluation.get('key_skills')
                        existing.experience_analysis = evaluation.get('experience_analysis')
                        existing.recommendation = evaluation.get('recommendation')
                        existing.detailed_analysis = evaluation.get('detailed_analysis')
                        existing.evaluation_type = 'deep'
                    
                    existing.expires_at = expires_at
                    logger.info(f"Updated cache for candidate {candidate_id}")
            else:
                # Создаем новую
                cache_entry = ResumeEvaluationCache(
                    candidate_id=candidate_id,
                    query_hash=query_hash,
                    query_embedding=query_embedding.tolist(),
                    quick_score=evaluation.get('quick_score', evaluation.get('score')),
                    deep_score=evaluation.get('score') if evaluation_type == 'deep' else None,
                    strengths=evaluation.get('strengths') if evaluation_type == 'deep' else None,
                    weaknesses=evaluation.get('weaknesses') if evaluation_type == 'deep' else None,
                    ai_detection=evaluation.get('ai_detection') if evaluation_type == 'deep' else None,
                    key_skills=evaluation.get('key_skills') if evaluation_type == 'deep' else None,
                    experience_analysis=evaluation.get('experience_analysis') if evaluation_type == 'deep' else None,
                    recommendation=evaluation.get('recommendation') if evaluation_type == 'deep' else None,
                    detailed_analysis=evaluation.get('detailed_analysis') if evaluation_type == 'deep' else None,
                    evaluation_type=evaluation_type,
                    expires_at=expires_at
                )
                db.add(cache_entry)
                logger.info(f"Saved new cache for candidate {candidate_id} (type: {evaluation_type})")
            
            db.commit()
            
        finally:
            db.close()
    
    async def save_evaluations_batch(
        self,
        evaluations: List[Tuple[int, str, np.ndarray, Dict[str, Any], str]]
    ):
        """
        Пакетное сохранение оценок
        """
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            expires_at = now + timedelta(days=self.cache_days)
            
            for candidate_id, query, query_embedding, evaluation, eval_type in evaluations:
                query_hash = self._generate_query_hash(query)
                
                cache_entry = ResumeEvaluationCache(
                    candidate_id=candidate_id,
                    query_hash=query_hash,
                    query_embedding=query_embedding.tolist(),
                    quick_score=evaluation.get('quick_score', evaluation.get('score')),
                    deep_score=evaluation.get('score') if eval_type == 'deep' else None,
                    strengths=evaluation.get('strengths') if eval_type == 'deep' else None,
                    weaknesses=evaluation.get('weaknesses') if eval_type == 'deep' else None,
                    ai_detection=evaluation.get('ai_detection') if eval_type == 'deep' else None,
                    key_skills=evaluation.get('key_skills') if eval_type == 'deep' else None,
                    experience_analysis=evaluation.get('experience_analysis') if eval_type == 'deep' else None,
                    recommendation=evaluation.get('recommendation') if eval_type == 'deep' else None,
                    detailed_analysis=evaluation.get('detailed_analysis') if eval_type == 'deep' else None,
                    evaluation_type=eval_type,
                    expires_at=expires_at
                )
                db.add(cache_entry)
            
            db.commit()
            logger.info(f"Saved {len(evaluations)} evaluations to cache")
            
        finally:
            db.close()
    
    def _cache_to_dict(self, cache: ResumeEvaluationCache) -> Dict[str, Any]:
        """Преобразование объекта кеша в словарь"""
        result = {
            'cache_id': cache.id,
            'quick_score': cache.quick_score,
            'evaluation_type': cache.evaluation_type,
            'created_at': cache.created_at,
            'expires_at': cache.expires_at
        }
        
        if cache.deep_score:
            result.update({
                'score': cache.deep_score,
                'strengths': cache.strengths,
                'weaknesses': cache.weaknesses,
                'ai_detection': cache.ai_detection,
                'key_skills': cache.key_skills,
                'experience_analysis': cache.experience_analysis,
                'recommendation': cache.recommendation,
                'detailed_analysis': cache.detailed_analysis
            })
        
        return result
    
    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Преобразование строки результата запроса в словарь"""
        return {
            'cache_id': row[0],
            'candidate_id': row[1],
            'query_hash': row[2],
            'quick_score': row[3],
            'score': row[4] if row[4] is not None else row[3],  # deep_score или quick_score
            'strengths': row[5],
            'weaknesses': row[6],
            'ai_detection': row[7],
            'key_skills': row[8],
            'experience_analysis': row[9],
            'recommendation': row[10],
            'detailed_analysis': row[11],
            'evaluation_type': row[12],
            'created_at': row[13],
            'expires_at': row[14],
            'similarity': row[15] if len(row) > 15 else None
        }
    
    async def clean_expired_cache(self):
        """Очистка просроченного кеша"""
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            deleted = db.query(ResumeEvaluationCache).filter(
                ResumeEvaluationCache.expires_at <= now
            ).delete()
            db.commit()
            if deleted:
                logger.info(f"Cleaned {deleted} expired cache entries")
        finally:
            db.close()