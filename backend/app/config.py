from pydantic_settings import BaseSettings, SettingsConfigDict
import os
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    
    # PostgreSQL
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "talkpro"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    
    # HH.ru API
    HH_API_BASE_URL: str = "https://hh.ru"
    HH_USER_AGENT: str = "TalkPro/1.0"
    
    # Gigachat API
    GIGACHAT_API_KEY: str = ""
    GIGACHAT_BASE_URL: str = "https://gigachat.devices.sberbank.ru/api/v1"
    GIGACHAT_MODEL: str = "GigaChat"
    GIGACHAT_SCOPE: str = "GIGACHAT_API_PERS"
    GIGACHAT_AUTH_URL: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    
    # Gigachat для эмбеддингов (используем ту же модель)
    GIGACHAT_EMBEDDING_MODEL: str = "GigaChat"  # Gigachat поддерживает эмбеддинги через API
    
    # Параметры поиска
    CANDIDATE_CACHE_DAYS: int = 3  # дней актуальности данных
    MAX_CANDIDATES_FOR_ANALYSIS: int = 20  # сколько кандидатов оценивать
    TOP_CANDIDATES_COUNT: int = 5  # топ-5 для глубокого анализа
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()