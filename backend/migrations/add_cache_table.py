"""
Скрипт для добавления таблицы кеша в существующую БД
"""
import psycopg2
from app.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_cache_table():
    """Добавление таблицы resume_evaluation_cache"""
    try:
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        # Создаем таблицу кеша
        cur.execute("""
        CREATE TABLE IF NOT EXISTS resume_evaluation_cache (
            id SERIAL PRIMARY KEY,
            candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
            query_hash VARCHAR(64) NOT NULL,
            query_embedding vector(1024),
            quick_score FLOAT,
            deep_score FLOAT,
            strengths JSONB,
            weaknesses JSONB,
            ai_detection JSONB,
            key_skills JSONB,
            experience_analysis TEXT,
            recommendation TEXT,
            detailed_analysis JSONB,
            evaluation_type VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS ix_cache_candidate_id ON resume_evaluation_cache(candidate_id);
        CREATE INDEX IF NOT EXISTS ix_cache_query_hash ON resume_evaluation_cache(query_hash);
        CREATE INDEX IF NOT EXISTS ix_cache_expires ON resume_evaluation_cache(expires_at);
        CREATE INDEX IF NOT EXISTS ix_cache_candidate_query ON resume_evaluation_cache(candidate_id, query_hash);
        
        -- Добавляем embedding index для векторного поиска
        CREATE INDEX IF NOT EXISTS ix_cache_query_embedding ON resume_evaluation_cache 
        USING ivfflat (query_embedding vector_cosine_ops);
        """)
        
        # Добавляем поле cache_id в candidate_evaluations если его нет
        cur.execute("""
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='candidate_evaluations' 
                          AND column_name='cache_id') THEN
                ALTER TABLE candidate_evaluations ADD COLUMN cache_id INTEGER;
                ALTER TABLE candidate_evaluations ADD CONSTRAINT fk_evaluations_cache 
                    FOREIGN KEY (cache_id) REFERENCES resume_evaluation_cache(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """)
        
        logger.info("Cache table created successfully")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error creating cache table: {e}")
        raise

if __name__ == "__main__":
    add_cache_table()