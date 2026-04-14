"""
Подключение к базе данных и управление сессиями
С автоматическим переключением на SQLite если PostgreSQL недоступен
"""
import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from contextlib import contextmanager
from typing import Generator
import logging

logger = logging.getLogger(__name__)

# Определяем, использовать ли SQLite или PostgreSQL
USE_SQLITE = os.getenv("USE_SQLITE", "true").lower() == "true"
DATABASE_URL = os.getenv("DATABASE_URL", "")

if USE_SQLITE or not DATABASE_URL:
    # Используем SQLite для локальной разработки
    db_path = os.path.join(os.path.dirname(__file__), "..", "talkpro.db")
    DATABASE_URL = f"sqlite:///{db_path}"
    logger.info(f"Using SQLite database at {db_path}")
    
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
else:
    # Пробуем PostgreSQL
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            echo=False,
            connect_args={
                "connect_timeout": 5,
                "client_encoding": "utf8"
            }
        )
        # Проверяем подключение
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        logger.info("Connected to PostgreSQL")
    except Exception as e:
        logger.warning(f"PostgreSQL connection failed: {e}")
        logger.info("Falling back to SQLite")
        
        db_path = os.path.join(os.path.dirname(__file__), "..", "talkpro.db")
        DATABASE_URL = f"sqlite:///{db_path}"
        
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False
        )
        logger.info(f"Using SQLite database at {db_path}")

# Фабрика сессий
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Generator[Session, None, None]:
    """
    Получение сессии базы данных (для FastAPI зависимостей)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Контекстный менеджер для получения сессии
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """
    Инициализация базы данных (создание таблиц)
    """
    from .models import Base
    
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        raise


def drop_db():
    """
    Удаление всех таблиц (только для разработки)
    """
    from .models import Base
    Base.metadata.drop_all(bind=engine)
    logger.warning("All database tables dropped")