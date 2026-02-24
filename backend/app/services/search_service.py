import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal
from app.models import Candidate, SearchQuery, CandidateEvaluation, ResumeEvaluationCache
from app.config import settings
from app.services.hh_parser import HHParser
from app.services.query_processor import QueryProcessor
from app.services.resume_analyzer import ResumeAnalyzer
from app.services.evaluation_cache import EvaluationCacheService
from app.core.gigachat_client import GigachatClient
import logging
import numpy as np

logger = logging.getLogger(__name__)

class SearchService:
    def __init__(self):
        self.hh_parser = HHParser()
        self.query_processor = QueryProcessor()
        self.resume_analyzer = ResumeAnalyzer()
        self.gigachat = GigachatClient()
        self.cache_service = EvaluationCacheService()
    
    async def search_candidates(self, query: str, user_id: str = None) -> Dict[str, Any]:
        """
        Основной метод поиска кандидатов с двухэтапной оценкой и кешированием
        """
        try:
            # 1. Обработка запроса
            filters = self.query_processor.process(query)
            logger.info(f"Processed query: {filters}")
            
            # 2. Генерируем эмбеддинг запроса
            query_embedding = await self.gigachat.generate_embedding(query)
            
            # 3. Сохраняем запрос
            query_id = await self._save_search_query(query, filters, query_embedding, user_id)
            
            # 4. Поиск кандидатов
            candidates = await self._find_candidates(query, filters, query_embedding)
            
            if not candidates:
                return {
                    'success': False,
                    'message': 'Кандидаты не найдены',
                    'candidates': []
                }
            
            logger.info(f"Found {len(candidates)} candidates")
            
            # 5. ЭТАП 1: Быстрое ранжирование с использованием кеша
            logger.info("Stage 1: Quick ranking candidates")
            ranked_results = await self.resume_analyzer.quick_rank_candidates(
                query, query_embedding, candidates
            )
            
            # Извлекаем индексы и оценки
            ranked_indices = [(idx, score) for idx, score, _ in ranked_results]
            
            # Сохраняем связи с запросом
            await self._save_evaluation_links(query_id, candidates, ranked_indices)
            
            # 6. Выбираем топ-5 для глубокого анализа
            top_indices = [idx for idx, _ in ranked_indices[:settings.TOP_CANDIDATES_COUNT]]
            logger.info(f"Stage 2: Deep analyzing top {len(top_indices)} candidates")
            
            # 7. ЭТАП 2: Глубокий анализ топ-5 с использованием кеша
            deep_analysis_results = await self.resume_analyzer.deep_analyze_candidates(
                query, query_embedding, candidates, top_indices
            )
            
            # 8. Формируем финальный список
            final_candidates = []
            
            # Сначала добавляем топ-5 с глубоким анализом
            for rank, (idx, quick_score) in enumerate(ranked_indices[:settings.TOP_CANDIDATES_COUNT]):
                candidate = candidates[idx]
                
                # Получаем анализ (из кеша или новый)
                analysis = deep_analysis_results.get(idx, {})
                
                # Находим данные из кеша, если есть
                cache_data = None
                for _, _, cache in ranked_results:
                    if cache and cache.get('candidate_id') == candidate.get('id'):
                        cache_data = cache
                        break
                
                # Объединяем
                merged = self.resume_analyzer.merge_analysis_with_candidate(
                    candidate, analysis, quick_score
                )
                
                # Добавляем информацию из кеша
                if cache_data:
                    merged['cached_quick'] = True
                    merged['cache_id'] = cache_data.get('cache_id')
                
                merged['rank'] = rank + 1
                final_candidates.append(merged)
            
            # Добавляем остальных кандидатов
            for rank, (idx, quick_score) in enumerate(ranked_indices[settings.TOP_CANDIDATES_COUNT:], 
                                                    start=settings.TOP_CANDIDATES_COUNT + 1):
                candidate = candidates[idx]
                
                # Находим данные из кеша
                cache_data = None
                for _, _, cache in ranked_results:
                    if cache and cache.get('candidate_id') == candidate.get('id'):
                        cache_data = cache
                        break
                
                candidate_copy = candidate.copy()
                candidate_copy['quick_score'] = quick_score
                candidate_copy['score'] = quick_score
                candidate_copy['rank'] = rank
                
                if cache_data:
                    candidate_copy['cached_quick'] = True
                    candidate_copy['cache_id'] = cache_data.get('cache_id')
                
                final_candidates.append(candidate_copy)
            
            # 9. Очищаем старый кеш (в фоне)
            asyncio.create_task(self.cache_service.clean_expired_cache())
            
            return {
                'success': True,
                'query_id': query_id,
                'filters': filters,
                'total_found': len(candidates),
                'analyzed_deep': len(deep_analysis_results),
                'cached_count': sum(1 for c in final_candidates if c.get('cached_quick')),
                'candidates': final_candidates
            }
            
        except Exception as e:
            logger.error(f"Error in search_candidates: {e}", exc_info=True)
            return {
                'success': False,
                'message': str(e),
                'candidates': []
            }
    
    async def _find_candidates(
        self, 
        query: str, 
        filters: Dict[str, Any],
        query_embedding: np.ndarray
    ) -> List[Dict]:
        """Поиск кандидатов в БД или через парсинг hh.ru"""
        db = SessionLocal()
        try:
            three_days_ago = datetime.utcnow() - timedelta(days=settings.CANDIDATE_CACHE_DAYS)
            
            # Векторный поиск с pgvector
            similar_candidates = db.execute(
                text("""
                SELECT id, hh_id, first_name, last_name, position, company, 
                       experience, skills, resume_text, resume_url,
                       1 - (embedding <=> :query_embedding) as similarity
                FROM candidates
                WHERE last_parsed_at > :min_date
                ORDER BY embedding <=> :query_embedding
                LIMIT 30
                """),
                {
                    'query_embedding': str(query_embedding.tolist()),
                    'min_date': three_days_ago
                }
            ).fetchall()
            
            candidates = []
            
            if len(similar_candidates) >= 10:
                # Используем свежих кандидатов из БД
                logger.info(f"Using {len(similar_candidates)} cached candidates from DB")
                for row in similar_candidates:
                    candidates.append(self._db_row_to_dict(row))
                return candidates
            
            # Парсим hh.ru
            logger.info("Parsing fresh data from hh.ru")
            hh_candidates = await self.hh_parser.search_resumes(
                filters.get('search_query', query),
                filters,
                limit=30
            )
            
            for hh_item in hh_candidates:
                hh_id = hh_item.get('id')
                
                # Проверяем существование в БД
                existing = db.query(Candidate).filter_by(hh_id=hh_id).first()
                
                if existing and existing.last_parsed_at > three_days_ago:
                    candidates.append(self._db_candidate_to_dict(existing))
                else:
                    # Парсим детали
                    details = await self.hh_parser.get_resume_details(hh_id)
                    if details:
                        parsed = await self.hh_parser.parse_resume(details)
                        if parsed:
                            # Генерируем эмбеддинг
                            embedding = await self.gigachat.generate_embedding(parsed['resume_text'])
                            
                            if existing:
                                # Обновляем существующего
                                for key, value in parsed.items():
                                    setattr(existing, key, value)
                                existing.embedding = embedding.tolist()
                                existing.last_parsed_at = datetime.utcnow()
                                db_candidate = existing
                            else:
                                # Создаем нового
                                db_candidate = Candidate(
                                    **parsed,
                                    embedding=embedding.tolist()
                                )
                                db.add(db_candidate)
                            
                            db.commit()
                            db.refresh(db_candidate)
                            candidates.append(self._db_candidate_to_dict(db_candidate))
            
            return candidates
            
        finally:
            db.close()
    
    async def _save_search_query(
        self, 
        query: str, 
        filters: Dict, 
        query_embedding: np.ndarray,
        user_id: str
    ) -> int:
        """Сохранение поискового запроса"""
        db = SessionLocal()
        try:
            search_query = SearchQuery(
                query_text=query,
                parsed_filters=filters,
                embedding=query_embedding.tolist(),
                user_id=user_id
            )
            db.add(search_query)
            db.commit()
            db.refresh(search_query)
            
            return search_query.id
        finally:
            db.close()
    
    async def _save_evaluation_links(
        self,
        query_id: int,
        candidates: List[Dict],
        ranked_indices: List[Tuple[int, float]]
    ):
        """Сохранение связей запроса с оценками"""
        db = SessionLocal()
        try:
            for rank, (idx, score) in enumerate(ranked_indices):
                candidate = candidates[idx]
                candidate_id = candidate.get('id')
                
                if candidate_id:
                    # Ищем кеш для этого кандидата
                    cache_entry = db.query(ResumeEvaluationCache).filter_by(
                        candidate_id=candidate_id
                    ).order_by(ResumeEvaluationCache.created_at.desc()).first()
                    
                    evaluation = CandidateEvaluation(
                        query_id=query_id,
                        candidate_id=candidate_id,
                        cache_id=cache_entry.id if cache_entry else None,
                        rank=rank
                    )
                    db.add(evaluation)
            
            db.commit()
        finally:
            db.close()
    
    def _db_row_to_dict(self, row) -> Dict:
        """Преобразование строки результата запроса в словарь"""
        return {
            'id': row[0],
            'hh_id': row[1],
            'first_name': row[2],
            'last_name': row[3],
            'position': row[4],
            'company': row[5],
            'experience': row[6],
            'skills': row[7],
            'resume_text': row[8],
            'resume_url': row[9],
            'similarity': row[10]
        }
    
    def _db_candidate_to_dict(self, candidate: Candidate) -> Dict:
        """Преобразование объекта Candidate в словарь"""
        return {
            'id': candidate.id,
            'hh_id': candidate.hh_id,
            'first_name': candidate.first_name,
            'last_name': candidate.last_name,
            'position': candidate.position,
            'company': candidate.company,
            'experience': candidate.experience,
            'experience_months': candidate.experience_months,
            'skills': candidate.skills,
            'phone': candidate.phone,
            'email': candidate.email,
            'resume_text': candidate.resume_text,
            'resume_url': candidate.resume_url
        }
    
    async def get_candidate_with_cached_analysis(
        self,
        candidate_id: int,
        query: str
    ) -> Optional[Dict[str, Any]]:
        """
        Получение кандидата с кешированным анализом
        """
        db = SessionLocal()
        try:
            candidate = db.query(Candidate).get(candidate_id)
            if not candidate:
                return None
            
            # Генерируем эмбеддинг запроса
            query_embedding = await self.gigachat.generate_embedding(query)
            
            # Ищем кеш
            cached = await self.cache_service.find_cached_evaluation(
                candidate_id, query, query_embedding, require_deep=True
            )
            
            result = self._db_candidate_to_dict(candidate)
            
            if cached:
                result.update({
                    'score': cached.get('score'),
                    'strengths': cached.get('strengths'),
                    'weaknesses': cached.get('weaknesses'),
                    'ai_detection': cached.get('ai_detection'),
                    'key_skills': cached.get('key_skills'),
                    'experience_analysis': cached.get('experience_analysis'),
                    'recommendation': cached.get('recommendation'),
                    'cached': True,
                    'cache_id': cached.get('cache_id'),
                    'cached_at': cached.get('created_at'),
                    'expires_at': cached.get('expires_at')
                })
            
            return result
            
        finally:
            db.close()