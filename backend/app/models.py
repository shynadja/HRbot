from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float, JSON, Index, BigInteger, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.types import UserDefinedType
from datetime import datetime
from app.config import settings
import numpy as np
import json

# Настройка подключения к PostgreSQL
DATABASE_URL = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
engine = create_engine(DATABASE_URL)
Base = declarative_base()

# Кастомный тип для векторов
class Vector(UserDefinedType):
    def __init__(self, dimension):
        self.dimension = dimension
    
    def get_col_spec(self):
        return f"vector({self.dimension})"
    
    def bind_processor(self, dialect):
        def process(value):
            if value is None:
                return None
            if isinstance(value, np.ndarray):
                value = value.tolist()
            if isinstance(value, list):
                return '[' + ','.join(str(x) for x in value) + ']'
            return str(value)
        return process
    
    def result_processor(self, dialect, coltype):
        def process(value):
            if value is None:
                return None
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except:
                    return np.random.randn(1024).tolist()
            return value
        return process

class Candidate(Base):
    __tablename__ = 'candidates'
    
    id = Column(Integer, primary_key=True)
    hh_id = Column(String(50), unique=True, index=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    position = Column(String(200))
    company = Column(String(200))
    experience = Column(String(100))
    experience_months = Column(Integer)
    skills = Column(JSON)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    
    # Полные данные резюме
    resume_text = Column(Text)
    resume_url = Column(String(500))
    
    # Эмбеддинг от Gigachat
    embedding = Column(Vector(1024))
    
    # Метаданные
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_parsed_at = Column(DateTime)
    
    # Индекс для векторного поиска
    __table_args__ = (
        Index('ix_candidates_embedding', embedding, postgresql_using='ivfflat'),
    )

class SearchQuery(Base):
    __tablename__ = 'search_queries'
    
    id = Column(Integer, primary_key=True)
    query_text = Column(Text)
    parsed_filters = Column(JSON)
    embedding = Column(Vector(1024))
    user_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ResumeEvaluationCache(Base):
    """
    Кеш оценок резюме для разных запросов
    Позволяет не переоценивать кандидата для похожих запросов
    """
    __tablename__ = 'resume_evaluation_cache'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, index=True)  # ID кандидата
    query_hash = Column(String(64), index=True)  # Хеш запроса для быстрого поиска
    query_embedding = Column(Vector(1024))  # Эмбеддинг запроса для поиска похожих
    
    # Результаты оценки
    quick_score = Column(Float)  # Быстрая оценка
    deep_score = Column(Float, nullable=True)  # Глубокая оценка (если есть)
    strengths = Column(JSON, nullable=True)
    weaknesses = Column(JSON, nullable=True)
    ai_detection = Column(JSON, nullable=True)
    key_skills = Column(JSON, nullable=True)
    experience_analysis = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    detailed_analysis = Column(JSON, nullable=True)
    
    # Метаданные
    evaluation_type = Column(String(20))  # 'quick' или 'deep'
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)  # Дата истечения (created_at + 3 дня)
    
    __table_args__ = (
        Index('ix_evaluation_cache_candidate_query', candidate_id, query_hash),
        Index('ix_evaluation_cache_expires', expires_at),
    )

class CandidateEvaluation(Base):
    """Связь поискового запроса с оценками кандидатов"""
    __tablename__ = 'candidate_evaluations'
    
    id = Column(Integer, primary_key=True)
    query_id = Column(Integer, index=True)
    candidate_id = Column(Integer, index=True)
    cache_id = Column(Integer)  # Ссылка на кеш
    rank = Column(Integer)  # Позиция в выдаче
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('ix_evaluations_query_candidate', query_id, candidate_id, unique=True),
    )

# Создание таблиц
def init_db():
    Base.metadata.create_all(engine)