from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.services.search_service import SearchService
from app.services.evaluation_cache import EvaluationCacheService
from app.database import SessionLocal
from app.models import CandidateEvaluation, Candidate, SearchQuery, ResumeEvaluationCache
from app.config import settings
import logging

router = APIRouter()
search_service = SearchService()
cache_service = EvaluationCacheService()
logger = logging.getLogger(__name__)

class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    limit: Optional[int] = 5

class SearchResponse(BaseModel):
    success: bool
    query_id: Optional[int] = None
    message: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    total_found: Optional[int] = None
    analyzed_deep: Optional[int] = None
    cached_count: Optional[int] = None
    candidates: List[Dict[str, Any]] = []

@router.post("/cold-search", response_model=SearchResponse)
async def cold_search(request: SearchRequest):
    """
    Холодный поиск кандидатов с двухэтапной оценкой и кешированием результатов
    """
    try:
        logger.info(f"Cold search request: {request.query}")
        
        result = await search_service.search_candidates(
            query=request.query,
            user_id=request.user_id
        )
        
        # Ограничиваем количество результатов
        if result.get('success') and result.get('candidates'):
            result['candidates'] = result['candidates'][:request.limit]
        
        return result
        
    except Exception as e:
        logger.error(f"Error in cold_search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search/{query_id}/results")
async def get_search_results(query_id: int, include_all: bool = False):
    """
    Получение сохраненных результатов поиска
    """
    db = SessionLocal()
    try:
        search_query = db.query(SearchQuery).get(query_id)
        if not search_query:
            raise HTTPException(status_code=404, detail="Search query not found")
        
        # Получаем все оценки для этого запроса
        evaluations = db.query(CandidateEvaluation).filter_by(
            query_id=query_id
        ).order_by(CandidateEvaluation.rank).all()
        
        candidates = []
        for eval in evaluations:
            candidate = db.query(Candidate).get(eval.candidate_id)
            if candidate:
                candidate_dict = {
                    'id': candidate.id,
                    'hh_id': candidate.hh_id,
                    'first_name': candidate.first_name,
                    'last_name': candidate.last_name,
                    'position': candidate.position,
                    'company': candidate.company,
                    'experience': candidate.experience,
                    'skills': candidate.skills,
                    'phone': candidate.phone,
                    'rank': eval.rank
                }
                
                # Если есть кеш, добавляем данные из него
                if eval.cache_id:
                    cache = db.query(ResumeEvaluationCache).get(eval.cache_id)
                    if cache:
                        candidate_dict.update({
                            'quick_score': cache.quick_score,
                            'score': cache.deep_score or cache.quick_score,
                            'strengths': cache.strengths,
                            'weaknesses': cache.weaknesses,
                            'ai_detection': cache.ai_detection,
                            'key_skills': cache.key_skills,
                            'experience_analysis': cache.experience_analysis,
                            'recommendation': cache.recommendation,
                            'cached': True,
                            'cached_at': cache.created_at,
                            'expires_at': cache.expires_at
                        })
                
                candidates.append(candidate_dict)
        
        # Ограничиваем топ-5 если нужно
        if not include_all:
            candidates = candidates[:5]
        
        return {
            'success': True,
            'query_id': query_id,
            'query_text': search_query.query_text,
            'filters': search_query.parsed_filters,
            'total': len(evaluations),
            'candidates': candidates
        }
    finally:
        db.close()

@router.get("/candidate/{candidate_id}/analysis")
async def get_candidate_analysis(
    candidate_id: int, 
    query: str = Query(..., description="Поисковый запрос для контекста")
):
    """
    Получение анализа кандидата с использованием кеша
    """
    try:
        result = await search_service.get_candidate_with_cached_analysis(candidate_id, query)
        if not result:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        return {
            'success': True,
            'candidate': result
        }
    except Exception as e:
        logger.error(f"Error getting candidate analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache/clean")
async def clean_expired_cache(background_tasks: BackgroundTasks):
    """
    Очистка просроченного кеша (запускается в фоне)
    """
    background_tasks.add_task(cache_service.clean_expired_cache)
    return {
        'success': True,
        'message': 'Cache cleaning started'
    }

@router.get("/cache/stats")
async def get_cache_stats():
    """
    Получение статистики кеша
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        
        # Общее количество записей
        total = db.query(ResumeEvaluationCache).count()
        
        # Активные записи
        active = db.query(ResumeEvaluationCache).filter(
            ResumeEvaluationCache.expires_at > now
        ).count()
        
        # Просроченные
        expired = db.query(ResumeEvaluationCache).filter(
            ResumeEvaluationCache.expires_at <= now
        ).count()
        
        # По типам
        quick = db.query(ResumeEvaluationCache).filter_by(evaluation_type='quick').count()
        deep = db.query(ResumeEvaluationCache).filter_by(evaluation_type='deep').count()
        
        # Уникальные кандидаты
        unique_candidates = db.query(ResumeEvaluationCache.candidate_id).distinct().count()
        
        return {
            'success': True,
            'stats': {
                'total_entries': total,
                'active_entries': active,
                'expired_entries': expired,
                'quick_evaluations': quick,
                'deep_evaluations': deep,
                'unique_candidates': unique_candidates,
                'cache_duration_days': settings.CANDIDATE_CACHE_DAYS
            }
        }
    finally:
        db.close()

@router.post("/search/{query_id}/rerank")
async def rerank_search_results(query_id: int, background_tasks: BackgroundTasks):
    """
    Переранжирование результатов поиска с использованием актуального кеша
    """
    db = SessionLocal()
    try:
        search_query = db.query(SearchQuery).get(query_id)
        if not search_query:
            raise HTTPException(status_code=404, detail="Search query not found")
        
        # Получаем все оценки
        evaluations = db.query(CandidateEvaluation).filter_by(query_id=query_id).all()
        
        # Собираем актуальные оценки из кеша
        reranked = []
        for eval in evaluations:
            if eval.cache_id:
                cache = db.query(ResumeEvaluationCache).get(eval.cache_id)
                if cache and cache.expires_at > datetime.utcnow():
                    score = cache.deep_score or cache.quick_score
                    reranked.append((eval.id, score, eval.candidate_id))
        
        # Сортируем
        reranked.sort(key=lambda x: x[1], reverse=True)
        
        # Обновляем ранги
        for new_rank, (eval_id, score, _) in enumerate(reranked):
            db.query(CandidateEvaluation).filter_by(id=eval_id).update({'rank': new_rank})
        
        db.commit()
        
        # Запускаем фоновую очистку
        background_tasks.add_task(cache_service.clean_expired_cache)
        
        return {
            'success': True,
            'message': f'Reranked {len(reranked)} results',
            'query_id': query_id
        }
    finally:
        db.close()