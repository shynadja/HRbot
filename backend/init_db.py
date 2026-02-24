import psycopg2
from app.database import engine
from app.models import Base, init_db
from app.config import settings
import logging
import asyncio
from app.core.gigachat_client import GigachatClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_database():
    """Создание базы данных если не существует"""
    try:
        # Подключаемся к postgres
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database='postgres'
        )
        conn.autocommit = True
        
        cur = conn.cursor()
        
        # Проверяем существование базы данных
        cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{settings.POSTGRES_DB}'")
        exists = cur.fetchone()
        
        if not exists:
            cur.execute(f"CREATE DATABASE {settings.POSTGRES_DB}")
            logger.info(f"Database {settings.POSTGRES_DB} created")
        else:
            logger.info(f"Database {settings.POSTGRES_DB} already exists")
        
        cur.close()
        conn.close()
        
        # Подключаемся к созданной БД
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB
        )
        conn.autocommit = True
        
        cur = conn.cursor()
        
        # Устанавливаем расширение pgvector
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        logger.info("Vector extension created")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise

async def test_gigachat():
    """Тест подключения к Gigachat"""
    logger.info("Testing Gigachat connection...")
    client = GigachatClient()
    
    # Тест эмбеддинга
    embedding = await client.generate_embedding("тестовый запрос")
    logger.info(f"Embedding generated, shape: {embedding.shape}")
    
    # Тест быстрой оценки
    score = await client.quick_evaluate("тестовое резюме", "тестовый запрос")
    logger.info(f"Quick evaluation score: {score}")
    
    logger.info("Gigachat connection test completed")

if __name__ == "__main__":
    create_database()
    init_db()
    logger.info("Database initialization complete")
    
    # Тестируем Gigachat
    asyncio.run(test_gigachat())