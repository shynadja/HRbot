"""
TalkPro AI Services - Main Application
Интегрированный бэкенд с базой данных PostgreSQL
"""
import datetime
import os
import sys
import json
import re
import uuid
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from sqlalchemy.orm import Session
import uvicorn

# Загрузка переменных окружения
load_dotenv()

# Добавляем пути для импортов
sys.path.append(str(Path(__file__).parent))

from gigachat.gigachat_client import GigaChatClient
from database import get_db, init_db, User, Resume, Candidate, AuditLog, Feedback
from database.models import CandidateAnalysis, Meeting
from services.candidate_service import CandidateService
from cache.redis_cache_manager import RedisCacheManager
from evaluation.efficiency_analyzer import EfficiencyAnalyzer
from agents.single_agent import SingleAgent
from datetime import datetime, timedelta
from yandex_calendar import get_yandex_calendar_client

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO')),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== Инициализация глобальных сервисов ==========

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

# GigaChat API клиент (синглтон)
gigachat_client = GigaChatClient()

# Кэш менеджер
cache_manager = RedisCacheManager(
    redis_url=REDIS_URL,
    prefix="talkpro_cache",
    default_ttl=86400
)

# Анализатор эффективности
efficiency_analyzer = EfficiencyAnalyzer()

# Инициализация базы данных
try:
    init_db()
    logger.info("Database initialized successfully")
except Exception as e:
    logger.warning(f"Database initialization warning: {e}")

# FastAPI приложение
app = FastAPI(
    title="TalkPro AI Services",
    description="HR-ассистент с AI-анализом резюме",
    version="3.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== Pydantic модели ==========

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    uuid: str
    name: str
    email: str
    role: str
    status: str
    avatar: Optional[str] = None

class ResumeUploadResponse(BaseModel):
    id: int
    uuid: str
    file_name: str
    file_size: int
    candidate_uuid: str
    parsed_data: Dict[str, Any]

class CandidateSearchRequest(BaseModel):
    query: str
    resume_ids: List[int]
    personal_data_cache: Optional[Dict[str, Any]] = None

class AIAnalysisRequest(BaseModel):
    candidate_uuid: str

class FeedbackRequest(BaseModel):
    message: str
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None

# ========== Вспомогательные функции ==========

def get_user_from_db(db: Session, user_id: int) -> Optional[User]:
    """Получение пользователя из БД"""
    return db.query(User).filter(User.id == user_id).first()

def create_audit_log(
    db: Session,
    user_id: Optional[int],
    action: str,
    target: Optional[str] = None,
    details: Optional[str] = None,
    level: str = "info",
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Создание записи в логе аудита"""
    try:
        log = AuditLog(
            user_id=user_id,
            action=action,
            target=target,
            details=details,
            level=level,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error(f"Error creating audit log: {e}")

# ========== API Эндпоинты ==========

@app.get("/api/health")
async def health_check():
    """Проверка состояния сервиса"""
    return {"status": "healthy", "version": "3.0.0"}


@app.post("/api/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Аутентификация пользователя"""
    user = db.query(User).filter(User.email == request.email.lower().strip()).first()
    
    if not user:
        raise HTTPException(401, "Неверный email или пароль")
    
    # Для демо-режима - простая проверка пароля
    demo_passwords = {
        "user1@example.com": "user123",
        "admin@example.com": "admin123"
    }
    
    if request.email in demo_passwords and demo_passwords[request.email] == request.password:
        pass
    elif user.password_hash != request.password:
        raise HTTPException(401, "Неверный email или пароль")
    
    # Обновляем время последней активности
    user.last_active = datetime.datetime.utcnow()
    db.commit()
    
    create_audit_log(db, user.id, "login", details="Вход в систему")
    
    return {
        "success": True,
        "user": user.to_dict()
    }


@app.post("/api/resumes/upload")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: int = Form(...),
    personal_data: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Загрузка и парсинг резюме"""
    try:
        # Импорты для парсинга
        from pypdf import PdfReader
        import mammoth
    except ImportError:
        # Если библиотеки не установлены, используем заглушку
        logger.warning("PDF/DOCX parsing libraries not installed, using placeholder")
        resume_text = f"Uploaded file: {file.filename}"
    else:
        # Проверяем пользователя
        user = get_user_from_db(db, user_id)
        if not user:
            raise HTTPException(404, "Пользователь не найден")
        
        # Сохраняем файл
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        
        unique_name = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}_{file.filename}"
        file_path = upload_dir / unique_name
        
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Извлекаем текст
        resume_text = ""
        try:
            if file.filename.endswith('.pdf'):
                reader = PdfReader(file_path)
                resume_text = "\n".join(page.extract_text() for page in reader.pages)
            elif file.filename.endswith(('.doc', '.docx')):
                with open(file_path, "rb") as docx_file:
                    result = mammoth.extract_raw_text(docx_file)
                    resume_text = result.value
        except Exception as e:
            logger.error(f"Error extracting text: {e}")
            resume_text = f"Error extracting text from {file.filename}"
    
    # Парсим данные
    parsed_data = parse_resume_text(resume_text)
    
    # Добавляем персональные данные из кэша клиента
    if personal_data:
        try:
            client_data = json.loads(personal_data)
            parsed_data.update(client_data)
        except:
            pass
    
    # Проверяем пользователя еще раз (если не было импорта)
    user = get_user_from_db(db, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    
    # Сохраняем файл если еще не сохранили
    if 'file_path' not in locals():
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        unique_name = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}_{file.filename}"
        file_path = upload_dir / unique_name
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    
    # Создаем сервис и сохраняем кандидата
    service = CandidateService(db, gigachat_client, cache_manager, efficiency_analyzer)
    candidate, resume = service.create_candidate_from_resume(
        user_id=user.id,
        file_name=file.filename,
        file_path=str(file_path),
        file_size=len(content) if 'content' in locals() else 0,
        file_type=file.content_type or "application/octet-stream",
        parsed_data=parsed_data,
        resume_text=resume_text
    )
    
    create_audit_log(db, user.id, "upload_resume", target=candidate.uuid, details=f"Загружено резюме: {file.filename}")
    
    return {
        "id": resume.id,
        "uuid": resume.uuid,
        "file_name": file.filename,
        "file_size": len(content) if 'content' in locals() else 0,
        "candidate_uuid": candidate.uuid,
        "parsed_data": parsed_data
    }


@app.get("/api/resumes")
async def get_resumes(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Получение списка резюме пользователя"""
    if not user_id:
        return {"resumes": []}
    
    service = CandidateService(db, gigachat_client, cache_manager, efficiency_analyzer)
    resumes = service.get_user_resumes(user_id)
    
    return {"resumes": resumes}


@app.get("/api/resumes/{resume_id}")
async def get_resume(
    resume_id: int,
    db: Session = Depends(get_db)
):
    """Получение информации о резюме"""
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "Резюме не найдено")
    
    return resume.to_dict(include_candidate_data=True)


@app.get("/api/resumes/{resume_id}/view")
async def view_resume(
    resume_id: int,
    db: Session = Depends(get_db)
):
    """Просмотр файла резюме"""
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "Резюме не найдено")
    
    file_path = Path(resume.file_path)
    if not file_path.exists():
        raise HTTPException(404, "Файл не найден")
    
    return FileResponse(
        file_path,
        media_type=resume.file_type,
        filename=resume.file_name
    )


@app.delete("/api/resumes/{resume_id}")
async def delete_resume(
    resume_id: int,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Мягкое удаление резюме"""
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "Резюме не найдено")
    
    resume.is_active = False
    resume.deleted_at = datetime.datetime.utcnow()
    db.commit()
    
    if user_id:
        create_audit_log(db, user_id, "delete_resume", target=str(resume_id), details="Мягкое удаление резюме")
    
    return {"success": True, "message": "Резюме удалено"}


@app.post("/api/candidates/search")
async def search_candidates(
    request: CandidateSearchRequest,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Поиск кандидатов с анализом через Single Agent
    """
    if not user_id:
        raise HTTPException(401, "Требуется аутентификация")
    
    if not request.resume_ids:
        return {
            "total_found": 0,
            "analyzed_deep": 0,
            "candidates": []
        }
    
    service = CandidateService(db, gigachat_client, cache_manager, efficiency_analyzer)
    
    candidates = service.search_candidates(
        user_id=user_id,
        resume_ids=request.resume_ids,
        search_query=request.query,
        personal_data_cache=request.personal_data_cache or {}
    )
    
    create_audit_log(
        db, user_id, "search_candidates",
        target=request.query[:100],
        details=f"Поиск по {len(request.resume_ids)} резюме, найдено {len(candidates)}"
    )
    
    return {
        "total_found": len(candidates),
        "analyzed_deep": len(candidates),
        "cached_count": 0,
        "candidates": candidates
    }


@app.post("/api/resumes/{resume_id}/analyze")
async def analyze_resume_ai(
    resume_id: int,
    db: Session = Depends(get_db)
):
    """
    Анализ резюме на использование ИИ
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "Резюме не найдено")
    
    service = CandidateService(db, gigachat_client, cache_manager, efficiency_analyzer)
    
    result = service.analyze_ai_detection(resume.candidate.uuid)
    
    return result


@app.post("/api/feedback")
async def send_feedback(
    request: FeedbackRequest,
    db: Session = Depends(get_db)
):
    """Отправка обратной связи"""
    feedback = Feedback(
        user_id=request.user_id,
        message=request.message,
        status="new",
        is_read=False
    )
    db.add(feedback)
    db.commit()
    
    create_audit_log(db, request.user_id, "send_feedback", details="Отправлена обратная связь")
    
    return {"success": True, "id": feedback.id}


@app.get("/api/admin/stats")
async def get_admin_stats(db: Session = Depends(get_db)):
    """Статистика для админ-панели"""
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.status == "active").count()
    total_resumes = db.query(Resume).filter(Resume.is_active == True).count()
    total_analyses = db.query(CandidateAnalysis).count()
    total_feedback = db.query(Feedback).count()
    
    return {
        "stats": {
            "total_users": total_users,
            "active_users": active_users,
            "total_resumes": total_resumes,
            "total_analyses": total_analyses,
            "total_feedback": total_feedback
        }
    }

# ========== Встречи ==========

class CreateMeetingRequest(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    duration_minutes: int = 60
    timezone: str = "Europe/Moscow"
    candidate_email: str
    candidate_name: Optional[str] = None
    candidate_phone: Optional[str] = None
    candidate_position: Optional[str] = None
    interviewer_email: Optional[str] = None
    interviewer_name: Optional[str] = None
    resume_id: Optional[int] = None
    search_query: Optional[str] = None
    vacancy_requirements: Optional[Dict[str, Any]] = None
    ai_score: Optional[float] = None
    ai_analysis_id: Optional[int] = None
    calendar_type: str = "yandex"
    reminder_settings: Optional[Dict[str, Any]] = None

class UpdateMeetingStatusRequest(BaseModel):
    status: str
    notes: Optional[str] = None
    outcome: Optional[str] = None
    rating: Optional[int] = None
    feedback: Optional[Dict[str, Any]] = None


@app.get("/api/meetings")
async def get_meetings(
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получение списка встреч"""
    query = db.query(Meeting)
    
    if user_id:
        query = query.filter(
            (Meeting.user_id == user_id) | (Meeting.created_by == user_id)
        )
    
    if status:
        query = query.filter(Meeting.status == status)
    
    meetings = query.order_by(Meeting.start_time.desc()).all()
    
    return {
        "meetings": [m.to_dict(include_details=True) for m in meetings],
        "total": len(meetings)
    }


@app.get("/api/meetings/{meeting_id}")
async def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db)
):
    """Получение встречи по ID"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    
    return {"meeting": meeting.to_dict(include_details=True)}


@app.get("/api/meetings/candidate/{resume_id}")
async def get_candidate_meetings(
    resume_id: int,
    db: Session = Depends(get_db)
):
    """Получение всех встреч по кандидату"""
    meetings = db.query(Meeting).filter(
        Meeting.resume_id == resume_id
    ).order_by(Meeting.start_time.desc()).all()
    
    return {
        "meetings": [m.to_dict(include_details=True) for m in meetings],
        "total": len(meetings)
    }


@app.post("/api/meetings")
async def create_meeting(
    request: CreateMeetingRequest,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Создание новой встречи"""
    
    # Вычисляем end_time если не указан
    start_time = datetime.fromisoformat(request.start_time.replace('Z', '+00:00'))
    if request.end_time:
        end_time = datetime.fromisoformat(request.end_time.replace('Z', '+00:00'))
    else:
        end_time = start_time + timedelta(minutes=request.duration_minutes)
    
    # Находим candidate_id по resume_id
    candidate_id = None
    if request.resume_id:
        resume = db.query(Resume).filter(Resume.id == request.resume_id).first()
        if resume:
            candidate_id = resume.candidate_id
    
    meeting = Meeting(
        user_id=user_id,
        created_by=user_id,
        resume_id=request.resume_id,
        candidate_id=candidate_id,
        
        title=request.title,
        description=request.description,
        location=request.location,
        
        start_time=start_time,
        end_time=end_time,
        duration_minutes=request.duration_minutes,
        timezone=request.timezone,
        
        candidate_email=request.candidate_email,
        candidate_name=request.candidate_name,
        candidate_phone=request.candidate_phone,
        candidate_position=request.candidate_position,
        
        interviewer_email=request.interviewer_email,
        interviewer_name=request.interviewer_name,
        
        calendar_type=request.calendar_type,
        
        search_query=request.search_query,
        vacancy_requirements=request.vacancy_requirements,
        
        ai_score=request.ai_score,
        ai_analysis_id=request.ai_analysis_id,
        
        reminder_settings=request.reminder_settings,
        
        status="scheduled"
    )
    
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    
    # Логируем создание
    create_audit_log(
        db, user_id, "create_meeting",
        target=request.candidate_email,
        details=f"Создана встреча: {request.title}, резюме ID: {request.resume_id}"
    )
    
    logger.info(f"Meeting created with ID: {meeting.id}")
    
    return {
        "success": True,
        "meeting": meeting.to_dict(include_details=True)
    }


@app.put("/api/meetings/{meeting_id}/status")
async def update_meeting_status(
    meeting_id: int,
    request: UpdateMeetingStatusRequest,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Обновление статуса встречи"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    
    valid_statuses = ["scheduled", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]
    if request.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid_statuses}")
    
    meeting.status = request.status
    
    if request.notes is not None:
        meeting.notes = request.notes
    
    if request.outcome is not None:
        meeting.outcome = request.outcome
    
    if request.rating is not None:
        meeting.rating = request.rating
    
    if request.feedback is not None:
        meeting.feedback = request.feedback
    
    meeting.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(meeting)
    
    create_audit_log(
        db, user_id, "update_meeting_status",
        target=str(meeting_id),
        details=f"Статус встречи изменен на: {request.status}"
    )
    
    return {
        "success": True,
        "meeting": meeting.to_dict(include_details=True)
    }


@app.put("/api/meetings/{meeting_id}/calendar")
async def update_meeting_calendar(
    meeting_id: int,
    calendar_event_id: str,
    calendar_link: Optional[str] = None,
    calendar_data: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db)
):
    """Обновление данных календаря для встречи"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    
    meeting.calendar_event_id = calendar_event_id
    if calendar_link:
        meeting.calendar_link = calendar_link
    if calendar_data:
        meeting.calendar_data = calendar_data
    
    meeting.updated_at = datetime.utcnow()
    meeting.status = "confirmed"
    
    db.commit()
    db.refresh(meeting)
    
    return {
        "success": True,
        "meeting": meeting.to_dict()
    }


@app.delete("/api/meetings/{meeting_id}")
async def delete_meeting(
    meeting_id: int,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Удаление встречи"""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    
    meeting_info = {
        "id": meeting.id,
        "title": meeting.title,
        "candidate_email": meeting.candidate_email
    }
    
    db.delete(meeting)
    db.commit()
    
    create_audit_log(
        db, user_id, "delete_meeting",
        target=meeting_info["candidate_email"],
        details=f"Удалена встреча: {meeting_info['title']}"
    )
    
    return {
        "success": True,
        "message": "Meeting deleted",
        "deleted_meeting": meeting_info
    }


@app.get("/api/meetings/stats")
async def get_meetings_stats(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Получение статистики по встречам"""
    query = db.query(Meeting)
    
    if user_id:
        query = query.filter(
            (Meeting.user_id == user_id) | (Meeting.created_by == user_id)
        )
    
    meetings = query.all()
    now = datetime.utcnow()
    
    stats = {
        "total": len(meetings),
        "scheduled": sum(1 for m in meetings if m.status == "scheduled"),
        "confirmed": sum(1 for m in meetings if m.status == "confirmed"),
        "completed": sum(1 for m in meetings if m.status == "completed"),
        "cancelled": sum(1 for m in meetings if m.status == "cancelled"),
        "no_show": sum(1 for m in meetings if m.status == "no_show"),
        
        "upcoming": sum(1 for m in meetings if m.status in ["scheduled", "confirmed"] and m.start_time > now),
        "past": sum(1 for m in meetings if m.start_time < now),
        
        "with_resume": sum(1 for m in meetings if m.resume_id),
        "with_ai_score": sum(1 for m in meetings if m.ai_score),
        
        "outcomes": {
            "hired": sum(1 for m in meetings if m.outcome == "hired"),
            "rejected": sum(1 for m in meetings if m.outcome == "rejected"),
            "second_interview": sum(1 for m in meetings if m.outcome == "second_interview"),
            "pending": sum(1 for m in meetings if m.outcome == "pending")
        },
        
        "avg_rating": sum(m.rating for m in meetings if m.rating) / max(1, sum(1 for m in meetings if m.rating))
    }
    
    return {"stats": stats}

class CalendarEventRequest(BaseModel):
    """Модель запроса для создания события в календаре"""
    title: str
    description: Optional[str] = ""
    start_time: str
    duration_minutes: int = 60
    candidate_email: str
    candidate_name: Optional[str] = ""
    candidate_position: Optional[str] = ""
    interviewer_email: Optional[str] = ""
    interviewer_name: Optional[str] = ""
    resume_id: Optional[int] = None
    user_id: Optional[int] = None
    location: Optional[str] = ""


@app.post("/api/calendar/create")
async def create_calendar_event(
    request: dict,  # Принимаем как dict для гибкости
    db: Session = Depends(get_db)
):
    """Создание события в календаре и сохранение встречи в БД"""
    
    logger.info(f"[PYTHON] Received calendar event request: {json.dumps(request, default=str)}")
    
    try:
        # Извлекаем данные с fallback значениями
        title = request.get("title", "Собеседование")
        description = request.get("description", "")
        start_time = request.get("start_time")
        duration_minutes = request.get("duration_minutes", 60)
        candidate_email = request.get("candidate_email", "")
        candidate_name = request.get("candidate_name", "")
        candidate_position = request.get("candidate_position", "")
        interviewer_email = request.get("interviewer_email", "")
        interviewer_name = request.get("interviewer_name", "")
        resume_id = request.get("resume_id")
        user_id = request.get("user_id")
        location = request.get("location", "")
        
        # Проверяем обязательные поля
        if not title or not start_time or not candidate_email:
            missing = []
            if not title: missing.append("title")
            if not start_time: missing.append("start_time")
            if not candidate_email: missing.append("candidate_email")
            logger.error(f"[PYTHON] Missing required fields: {missing}")
            raise HTTPException(400, f"Missing required fields: {missing}")
        
        # Парсим время
        try:
            # Обрабатываем разные форматы ISO
            time_str = start_time.replace('Z', '+00:00')
            start_dt = datetime.fromisoformat(time_str)
        except Exception as e:
            logger.error(f"[PYTHON] Error parsing start_time '{start_time}': {e}")
            # Fallback: завтра в 10:00
            start_dt = datetime.now() + timedelta(days=1)
            start_dt = start_dt.replace(hour=10, minute=0, second=0, microsecond=0)
        
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        
        # Создаем встречу в БД
        meeting = Meeting(
            user_id=user_id,
            created_by=user_id,
            resume_id=resume_id,
            
            title=title,
            description=description,
            location=location,
            
            start_time=start_dt,
            end_time=end_dt,
            duration_minutes=duration_minutes,
            
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            candidate_position=candidate_position,
            
            interviewer_email=interviewer_email,
            interviewer_name=interviewer_name,
            
            status="scheduled"
        )
        
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        
        logger.info(f"[PYTHON] Meeting saved to DB with ID: {meeting.id}")
        
        # Пробуем создать событие в календаре
        try:
            from yandex_calendar import get_yandex_calendar_client
            
            calendar_client = get_yandex_calendar_client()
            
            event_result = await calendar_client.create_interview_event(
                candidate_email=candidate_email,
                interviewer_email=interviewer_email or "recruiter@talkpro.ru",
                start_time=start_time,
                duration_minutes=duration_minutes,
                title=title,
                description=description,
                location=location
            )
            
            meeting.calendar_event_id = event_result.get("event_id")
            meeting.calendar_link = event_result.get("links", {}).get("html")
            meeting.calendar_data = event_result
            meeting.status = "confirmed"
            db.commit()
            
            logger.info(f"[PYTHON] Calendar event created: {event_result.get('event_id')}")
            
            return {
                "status": "created",
                "event_id": event_result.get("event_id"),
                "links": event_result.get("links"),
                "db_meeting_id": meeting.id,
                "db_saved": True
            }
            
        except Exception as e:
            logger.error(f"[PYTHON] Calendar API error: {e}")
            
            return {
                "status": "db_only",
                "db_meeting_id": meeting.id,
                "db_saved": True,
                "calendar_error": str(e)
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PYTHON] Unexpected error: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(500, f"Failed to create meeting: {str(e)}")
    
# ========== Вспомогательная функция парсинга ==========

def parse_resume_text(text: str) -> Dict[str, Any]:
    """Упрощенный парсинг текста резюме"""
    lines = text.split('\n')
    
    # Извлечение имени (первая непустая строка)
    name = ""
    for line in lines[:10]:
        line = line.strip()
        if line and len(line) < 50 and not line.startswith(('http', 'www', '@')):
            name = line
            break
    
    name_parts = name.split()
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[-1] if len(name_parts) > 1 else ""
    
    # Поиск должности
    position = ""
    position_keywords = ['developer', 'разработчик', 'engineer', 'инженер', 'manager', 'менеджер']
    for line in lines[:20]:
        line_lower = line.lower()
        if any(kw in line_lower for kw in position_keywords):
            position = line.strip()[:100]
            break
    
    # Поиск навыков
    skills = []
    common_skills = ['Python', 'Java', 'JavaScript', 'React', 'SQL', 'Docker', 'Git', 'AWS', 
                     'TypeScript', 'Node.js', 'C++', 'C#', 'Go', 'Rust']
    text_lower = text.lower()
    for skill in common_skills:
        if skill.lower() in text_lower:
            skills.append(skill)
    
    # Поиск опыта
    experience = ""
    exp_patterns = [r'опыт работы[:\s]*(\d+[-\s]*(?:год|лет|года))', r'experience[:\s]*(\d+[-\s]*(?:year|years))']
    for pattern in exp_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            experience = match.group(1)
            break
    
    return {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": name,
        "position": position or "Специалист",
        "experience": experience or "Не указан",
        "skills": skills[:10] or ["Python", "JavaScript"],
        "raw_text": text[:5000]
    }

# ========== GigaChat AI Эндпоинты ==========

@app.post("/api/gigachat/detect-ai")
async def detect_ai(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Определение вероятности генерации текста ИИ
    """
    text = request.get("text", "")
    prompt_key = request.get("prompt_key", "check_ai_generated")
    
    if not text:
        raise HTTPException(400, "Text is required")
    
    try:
        from gigachat.prompts import ANALYSIS_PROMPTS
        
        prompt = ANALYSIS_PROMPTS.get(prompt_key, ANALYSIS_PROMPTS["check_ai_generated"]).format(text=text[:5000])
        result, token_usage = gigachat_client.analyze(prompt, temperature=0.1, max_tokens=100)
        
        content = result["choices"][0]["message"]["content"]
        numbers = re.findall(r'\b\d{1,3}\b', content)
        ai_probability = int(numbers[0]) if numbers else 50
        
        return {
            "aiProbability": min(100, max(0, ai_probability)),
            "analysis": content,
            "tokens_used": token_usage.get('total_tokens', 0)
        }
    except Exception as e:
        logger.error(f"Error in AI detection: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/gigachat/find-exaggerations")
async def find_exaggerations(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Поиск преувеличений в тексте резюме
    """
    text = request.get("text", "")
    prompt_key = request.get("prompt_key", "find_exaggerations")
    
    if not text:
        raise HTTPException(400, "Text is required")
    
    try:
        from gigachat.prompts import ANALYSIS_PROMPTS
        
        prompt = ANALYSIS_PROMPTS.get(prompt_key, ANALYSIS_PROMPTS["find_exaggerations"]).format(text=text[:5000])
        result, token_usage = gigachat_client.analyze(prompt, temperature=0.1, max_tokens=500)
        
        content = result["choices"][0]["message"]["content"]
        
        # Извлекаем JSON массив
        json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            start = content.find('[')
            end = content.rfind(']') + 1
            if start != -1 and end > start:
                json_str = content[start:end]
            else:
                json_str = "[]"
        
        try:
            exaggerations = json.loads(json_str)
        except:
            exaggerations = []
        
        score = max(70, 100 - len(exaggerations) * 5)
        
        return {
            "score": score,
            "exaggerations": exaggerations,
            "count": len(exaggerations),
            "tokens_used": token_usage.get('total_tokens', 0)
        }
    except Exception as e:
        logger.error(f"Error finding exaggerations: {e}")
        raise HTTPException(500, str(e))


# ========== AI Прокси эндпоинты (для совместимости с Node.js) ==========

@app.post("/api/evaluate/candidate")
async def evaluate_candidate(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Оценка кандидата через Single Agent
    """
    try:
        agent = SingleAgent(
            api_client=gigachat_client,
            cache_manager=cache_manager,
            use_cache=True,
            efficiency_analyzer=efficiency_analyzer
        )
        
        result, token_usage = agent.process(request)
        result['token_usage'] = token_usage
        
        return result
    except Exception as e:
        logger.error(f"Error evaluating candidate: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/evaluate/batch")
async def evaluate_batch(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Пакетная оценка кандидатов
    """
    candidates = request.get("candidates", [])
    
    if not candidates:
        return {"results": [], "total_tokens": 0}
    
    agent = SingleAgent(
        api_client=gigachat_client,
        cache_manager=cache_manager,
        use_cache=True,
        efficiency_analyzer=efficiency_analyzer
    )
    
    results = []
    total_tokens = 0
    
    for candidate_data in candidates:
        try:
            result, token_usage = agent.process(candidate_data)
            results.append(result)
            total_tokens += token_usage.get('total_tokens', 0)
        except Exception as e:
            logger.error(f"Error processing candidate: {e}")
            results.append({"error": str(e)})
    
    return {
        "results": results,
        "total_tokens": total_tokens,
        "processed": len(results)
    }

@app.get("/api/stats/efficiency")
async def get_efficiency_stats():
    """Статистика эффективности"""
    return efficiency_analyzer.get_stats()


@app.get("/api/stats/tokens")
async def get_token_stats():
    """Статистика использования токенов"""
    return {
        "gigachat_api": gigachat_client.get_token_stats(),
        "efficiency_analyzer": efficiency_analyzer.get_stats(),
        "cost_estimate": efficiency_analyzer.get_token_cost_estimate()
    }

# ========== Запуск ==========

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )