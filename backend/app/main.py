from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import users, actions, stats, search
import os

app = FastAPI(
    title="TalkPro API",
    description="API для Telegram Mini App TalkPro",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "https://talkpro-frontend.loca.lt",
        "https://web.telegram.org",
        "https://t.me",
        ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(users.router, prefix="/api/user", tags=["users"])
app.include_router(actions.router, prefix="/api", tags=["action"])
app.include_router(stats.router, prefix="/api", tags=["stats"])
app.include_router(search.router, prefix="/api", tags=["search"])

@app.get("/")
async def root():
    return {
        "service": "TalkPro API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}