"""
Модели базы данных для TalkPro
Совместимы с PostgreSQL и SQLite
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, 
    ForeignKey, Text, Float, JSON, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid as uuid_lib

Base = declarative_base()


def generate_uuid():
    """Генерация UUID"""
    return str(uuid_lib.uuid4())


class User(Base):
    """Модель пользователя"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, default=generate_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user")
    status = Column(String(20), default="active")
    avatar = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    last_active = Column(DateTime, nullable=True)
    searches_count = Column(Integer, default=0)
    
    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    logs = relationship("AuditLog", back_populates="user")
    feedback = relationship("Feedback", back_populates="user")
    
    def to_dict(self):
        return {
            "id": self.id,
            "uuid": self.uuid,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "status": self.status,
            "avatar": self.avatar,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_active": self.last_active.isoformat() if self.last_active else None,
            "searches_count": self.searches_count
        }


class Candidate(Base):
    """Модель кандидата (ОБЕЗЛИЧЕННЫЕ ДАННЫЕ)"""
    __tablename__ = "candidates"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, default=generate_uuid)
    
    # Хэши персональных данных
    name_hash = Column(String(64), nullable=True)
    email_hash = Column(String(64), nullable=True)
    phone_hash = Column(String(64), nullable=True)
    
    # Обезличенные данные из резюме
    position = Column(String(255), nullable=True)
    experience_years = Column(Float, nullable=True)
    experience_text = Column(Text, nullable=True)
    education = Column(Text, nullable=True)
    skills = Column(JSON, nullable=True)
    hard_skills = Column(Text, nullable=True)
    soft_skills = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    
    resume_text = Column(Text, nullable=True)
    resume_file_name = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    analyses = relationship("CandidateAnalysis", back_populates="candidate", cascade="all, delete-orphan")
    resume_uploads = relationship("Resume", back_populates="candidate")
    
    def to_dict(self):
        return {
            "uuid": self.uuid,
            "position": self.position,
            "experience_years": self.experience_years,
            "experience_text": self.experience_text,
            "education": self.education,
            "skills": self.skills or [],
            "hard_skills": self.hard_skills,
            "soft_skills": self.soft_skills,
            "location": self.location,
            "salary_min": self.salary_min,
            "salary_max": self.salary_max,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Resume(Base):
    """Модель загруженного резюме"""
    __tablename__ = "resumes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String(100), nullable=False)
    
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    user = relationship("User", back_populates="resumes")
    candidate = relationship("Candidate", back_populates="resume_uploads")
    
    def to_dict(self, include_candidate=False):
        result = {
            "id": self.id,
            "uuid": self.uuid,
            "user_id": self.user_id,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "file_type": self.file_type,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
        if include_candidate and self.candidate:
            result["candidate"] = self.candidate.to_dict()
        return result


class CandidateAnalysis(Base):
    """Модель анализа кандидата"""
    __tablename__ = "candidate_analyses"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    vacancy_id = Column(String(100), nullable=True)
    
    quick_assessment_score = Column(Float, nullable=True)
    strengths = Column(JSON, nullable=True)
    improvements = Column(JSON, nullable=True)
    final_verdict = Column(String(50), nullable=True)
    verdict_reason = Column(Text, nullable=True)
    
    ai_probability = Column(Float, nullable=True)
    exaggerations = Column(JSON, nullable=True)
    suspicious_phrases = Column(JSON, nullable=True)
    
    processing_time = Column(Float, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    candidate = relationship("Candidate", back_populates="analyses")
    
    def to_dict(self):
        return {
            "id": self.id,
            "quick_assessment": {"score": self.quick_assessment_score} if self.quick_assessment_score else None,
            "strengths": self.strengths or [],
            "improvements": self.improvements or [],
            "final_verdict": {
                "decision": self.final_verdict,
                "reason": self.verdict_reason
            } if self.final_verdict else None,
            "ai_probability": self.ai_probability,
            "exaggerations": self.exaggerations or [],
            "suspicious_phrases": self.suspicious_phrases or [],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class AuditLog(Base):
    """Модель лога аудита"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    target = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    level = Column(String(20), default="info")
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    user = relationship("User", back_populates="logs")
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "action": self.action,
            "target": self.target,
            "details": self.details,
            "level": self.level,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Feedback(Base):
    """Модель обратной связи"""
    __tablename__ = "feedback"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="new")
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    session_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    user = relationship("User", back_populates="feedback")
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.name if self.user else "Гость",
            "user_email": self.user.email if self.user else None,
            "message": self.message,
            "status": self.status,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
        
class Meeting(Base):
    """Модель встречи (собеседования)"""
    __tablename__ = "meetings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, default=generate_uuid)
    
    # Связи с пользователем и резюме
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resume_id = Column(Integer, ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True)
    
    # Основная информация о встрече
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(500), nullable=True)
    
    # Время встречи
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    timezone = Column(String(50), default="Europe/Moscow")
    
    # Информация о кандидате (для быстрого доступа)
    candidate_email = Column(String(255), nullable=False)
    candidate_name = Column(String(255), nullable=True)
    candidate_phone = Column(String(50), nullable=True)
    candidate_position = Column(String(255), nullable=True)
    
    # Информация об интервьюере
    interviewer_email = Column(String(255), nullable=True)
    interviewer_name = Column(String(255), nullable=True)
    
    # Данные календаря
    calendar_type = Column(String(50), default="yandex")  # yandex, google, outlook
    calendar_event_id = Column(String(255), nullable=True)
    calendar_link = Column(String(1000), nullable=True)
    calendar_data = Column(JSON, nullable=True)  # Дополнительные данные от API календаря
    
    # Статус встречи
    status = Column(String(30), default="scheduled")  # scheduled, confirmed, completed, cancelled, no_show, rescheduled
    
    # Результаты встречи
    outcome = Column(String(50), nullable=True)  # hired, rejected, second_interview, pending
    notes = Column(Text, nullable=True)
    feedback = Column(JSON, nullable=True)  # Структурированный фидбек
    rating = Column(Integer, nullable=True)  # Оценка кандидата после собеседования (1-10)
    
    # Связанный поиск (требования вакансии)
    search_query = Column(Text, nullable=True)  # Текст запроса, по которому нашли кандидата
    vacancy_requirements = Column(JSON, nullable=True)  # Требования вакансии
    
    # Результаты AI-анализа на момент встречи
    ai_score = Column(Float, nullable=True)  # Оценка от AI
    ai_analysis_id = Column(Integer, ForeignKey("candidate_analyses.id", ondelete="SET NULL"), nullable=True)
    
    # Уведомления
    reminders_sent = Column(Boolean, default=False)
    reminder_settings = Column(JSON, nullable=True)  # Настройки напоминаний
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Отношения
    user = relationship("User", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by])
    resume = relationship("Resume", foreign_keys=[resume_id])
    candidate = relationship("Candidate", foreign_keys=[candidate_id])
    ai_analysis = relationship("CandidateAnalysis", foreign_keys=[ai_analysis_id])
    
    # Индексы для быстрого поиска
    __table_args__ = (
        Index("idx_meetings_user_id", "user_id"),
        Index("idx_meetings_resume_id", "resume_id"),
        Index("idx_meetings_candidate_id", "candidate_id"),
        Index("idx_meetings_status", "status"),
        Index("idx_meetings_start_time", "start_time"),
        Index("idx_meetings_calendar_event_id", "calendar_event_id"),
    )
    
    def to_dict(self, include_details=False):
        """Сериализация в словарь"""
        result = {
            "id": self.id,
            "uuid": self.uuid,
            "title": self.title,
            "description": self.description,
            "location": self.location,
            
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_minutes": self.duration_minutes,
            "timezone": self.timezone,
            
            "candidate_email": self.candidate_email,
            "candidate_name": self.candidate_name,
            "candidate_phone": self.candidate_phone,
            "candidate_position": self.candidate_position,
            
            "interviewer_email": self.interviewer_email,
            "interviewer_name": self.interviewer_name,
            
            "calendar_type": self.calendar_type,
            "calendar_event_id": self.calendar_event_id,
            "calendar_link": self.calendar_link,
            
            "status": self.status,
            "outcome": self.outcome,
            "notes": self.notes,
            "rating": self.rating,
            
            "search_query": self.search_query,
            
            "ai_score": self.ai_score,
            
            "reminders_sent": self.reminders_sent,
            
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        
        if include_details:
            result["feedback"] = self.feedback or {}
            result["vacancy_requirements"] = self.vacancy_requirements or {}
            result["calendar_data"] = self.calendar_data or {}
            result["reminder_settings"] = self.reminder_settings or {}
            
            if self.resume:
                result["resume"] = {
                    "id": self.resume.id,
                    "file_name": self.resume.file_name,
                    "uuid": self.resume.uuid
                }
            
            if self.candidate:
                result["candidate"] = self.candidate.to_dict()
            
            if self.ai_analysis:
                result["ai_analysis"] = self.ai_analysis.to_dict()
        
        return result
    
    def to_calendar_event(self):
        """Формат для создания события в календаре"""
        return {
            "title": self.title,
            "description": self.description,
            "location": self.location,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_minutes": self.duration_minutes,
            "attendees": [
                {"email": self.candidate_email, "name": self.candidate_name, "type": "candidate"},
                {"email": self.interviewer_email, "name": self.interviewer_name, "type": "interviewer"}
            ]
        }        