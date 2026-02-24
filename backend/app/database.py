from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from app.config import settings
import logging
from contextlib import contextmanager
from typing import Iterator

logger = logging.getLogger(__name__)

DATABASE_URL = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"

try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )
    logger.info(f"✅ PostgreSQL connected")
except Exception as e:
    logger.error(f"❌ PostgreSQL connection error: {e}")
    engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Вариант 1: Для FastAPI Depends (генератор)
def get_db() -> Iterator[Session]:
    """Get database session for FastAPI dependencies"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Вариант 2: Контекстный менеджер для ручного использования
@contextmanager
def get_db_context() -> Iterator[Session]:
    """Get database session as context manager"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Вариант 3: Простая функция для получения сессии
def get_db_session() -> Session:
    """Get database session (don't forget to close!)"""
    return SessionLocal()

def check_postgres_health() -> bool:
    try:
        if engine:
            with engine.connect() as conn:
                conn.execute("SELECT 1")
            return True
        return False
    except:
        return False