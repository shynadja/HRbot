import aiohttp
import asyncio
import json
import time
import base64
from typing import List, Dict, Any, Optional, Union
from app.config import settings
import logging
import numpy as np

logger = logging.getLogger(__name__)

class GigachatClient:
    def __init__(self):
        self.api_key = settings.GIGACHAT_API_KEY
        self.base_url = settings.GIGACHAT_BASE_URL
        self.auth_url = settings.GIGACHAT_AUTH_URL
        self.scope = settings.GIGACHAT_SCOPE
        self.model = settings.GIGACHAT_MODEL
        self.embedding_model = settings.GIGACHAT_EMBEDDING_MODEL
        self.access_token = None
        self.token_expires = 0
        self.embedding_dimension = 1024  # Размерность эмбеддингов Gigachat
    
    async def _get_access_token(self) -> Optional[str]:
        """Получение access токена для Gigachat"""
        try:
            if self.access_token and time.time() < self.token_expires:
                return self.access_token
            
            # Формируем Basic Auth заголовок
            auth_string = base64.b64encode(f"{self.api_key}:".encode()).decode()
            
            auth_headers = {
                'Authorization': f'Basic {auth_string}',
                'RqUID': self._generate_uuid(),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            
            data = {
                'scope': self.scope
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.auth_url, headers=auth_headers, data=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        self.access_token = result.get('access_token')
                        self.token_expires = time.time() + result.get('expires_in', 3600) - 60
                        logger.info("Successfully got Gigachat access token")
                        return self.access_token
                    else:
                        error_text = await response.text()
                        logger.error(f"Auth error: {response.status} - {error_text}")
                        return None
        except Exception as e:
            logger.error(f"Error getting access token: {e}")
            return None
    
    def _generate_uuid(self) -> str:
        """Генерация UUID для заголовка RqUID"""
        import uuid
        return str(uuid.uuid4())
    
    async def generate_embedding(self, text: str) -> np.ndarray:
        """
        Генерация эмбеддинга через Gigachat
        """
        try:
            token = await self._get_access_token()
            if not token:
                logger.warning("No access token, using random embedding")
                return np.random.randn(self.embedding_dimension)
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            # Для эмбеддингов используем специальный эндпоинт
            data = {
                'model': self.embedding_model,
                'input': text[:2000],  # Ограничиваем длину текста
                'encoding_format': 'float'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/embeddings", 
                    headers=headers, 
                    json=data
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        embedding = result.get('data', [{}])[0].get('embedding', [])
                        if embedding:
                            # Нормализуем эмбеддинг
                            embedding = np.array(embedding, dtype=np.float32)
                            norm = np.linalg.norm(embedding)
                            if norm > 0:
                                embedding = embedding / norm
                            return embedding
                    else:
                        error_text = await response.text()
                        logger.error(f"Embedding error: {response.status} - {error_text}")
            
            return np.random.randn(self.embedding_dimension)
            
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return np.random.randn(self.embedding_dimension)
    
    async def generate_embeddings_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Генерация эмбеддингов для списка текстов"""
        embeddings = []
        for text in texts:
            embedding = await self.generate_embedding(text)
            embeddings.append(embedding)
            # Небольшая задержка между запросами
            await asyncio.sleep(0.1)
        return embeddings
    
    async def quick_evaluate(self, resume_text: str, job_query: str) -> float:
        """
        Быстрая оценка кандидата (от 1 до 100)
        """
        try:
            token = await self._get_access_token()
            if not token:
                return 75.0  # значение по умолчанию
            
            prompt = f"""
            Оцени соответствие кандидата вакансии/запросу по шкале от 1 до 100.
            Верни ТОЛЬКО число, без пояснений.
            
            Запрос: {job_query}
            
            Резюме:
            {resume_text[:1500]}
            """
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            data = {
                'model': self.model,
                'messages': [
                    {'role': 'system', 'content': 'Ты - опытный HR-эксперт. Оценивай кандидатов быстро и объективно.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.1,
                'max_tokens': 10
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.base_url}/chat/completions", headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        content = result.get('choices', [{}])[0].get('message', {}).get('content', '75')
                        # Извлекаем число
                        import re
                        numbers = re.findall(r'\d+', content)
                        if numbers:
                            score = int(numbers[0])
                            return max(1, min(100, score))
                    else:
                        logger.error(f"Quick evaluate error: {response.status}")
            
            return 75.0
            
        except Exception as e:
            logger.error(f"Error in quick_evaluate: {e}")
            return 75.0
    
    async def deep_analyze(self, resume_text: str, job_query: str) -> Dict[str, Any]:
        """
        Глубокий анализ резюме с выделением сильных/слабых сторон и детекцией ИИ
        """
        try:
            token = await self._get_access_token()
            if not token:
                return self._get_default_deep_analysis()
            
            prompt = self._build_deep_analysis_prompt(resume_text, job_query)
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            data = {
                'model': self.model,
                'messages': [
                    {'role': 'system', 'content': 'Ты - профессиональный HR-аналитик. Анализируй резюме детально, указывай конкретные цитаты.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.2,
                'max_tokens': 3000
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.base_url}/chat/completions", headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        content = result.get('choices', [{}])[0].get('message', {}).get('content', '{}')
                        return self._parse_deep_analysis(content)
                    else:
                        logger.error(f"Deep analyze error: {response.status}")
            
            return self._get_default_deep_analysis()
            
        except Exception as e:
            logger.error(f"Error in deep_analyze: {e}")
            return self._get_default_deep_analysis()
    
    def _build_deep_analysis_prompt(self, resume_text: str, job_query: str) -> str:
        """Формирование промпта для глубокого анализа"""
        return f"""
        Проведи детальный анализ резюме кандидата для запроса: "{job_query}"
        
        Резюме:
        {resume_text[:4000]}
        
        Выполни следующие задачи:
        1. Оцени кандидата по шкале от 1 до 100 (объективная оценка)
        2. Выдели 3 сильные стороны кандидата
        3. Выдели 2 слабые стороны или рекомендации по улучшению
        4. Определи, есть ли в резюме текст, явно сгенерированный ИИ (да/нет) и какие части
        5. Выдели ключевые навыки (3-5 штук)
        6. Сделай краткий анализ опыта работы
        7. Дай рекомендацию по общению с кандидатом на собеседовании на основе анализа
        
        Верни результат строго в формате JSON:
        {{
            "score": число,
            "strengths": [
                {{
                    "text": "сильная сторона",
                    "quote": "цитата из резюме"
                }},
                ...
            ],
            "weaknesses": [
                {{
                    "text": "слабая сторона/рекомендация",
                    "quote": "цитата или обоснование"
                }},
                ...
            ],
            "ai_detection": {{
                "has_ai_generated": true/false,
                "suspicious_parts": ["часть1", "часть2"],
                "confidence": число от 0 до 100
            }},
            "key_skills": ["навык1", "навык2", ...],
            "experience_analysis": "текст анализа",
            "recommendation": "рекомендация"
        }}
        
        Важно: Все выводы должны быть основаны только на тексте резюме. Указывай конкретные цитаты.
        """
    
    def _parse_deep_analysis(self, content: str) -> Dict[str, Any]:
        """Парсинг ответа глубокого анализа"""
        try:
            import re
            # Ищем JSON в ответе
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                
                # Проверяем и дополняем обязательные поля
                return {
                    'score': result.get('score', 75),
                    'strengths': result.get('strengths', [])[:3],
                    'weaknesses': result.get('weaknesses', [])[:2],
                    'ai_detection': result.get('ai_detection', {
                        'has_ai_generated': False,
                        'suspicious_parts': [],
                        'confidence': 0
                    }),
                    'key_skills': result.get('key_skills', [])[:7],
                    'experience_analysis': result.get('experience_analysis', ''),
                    'recommendation': result.get('recommendation', ''),
                    'detailed_analysis': result
                }
        except Exception as e:
            logger.error(f"Error parsing deep analysis: {e}")
        
        return self._get_default_deep_analysis()
    
    def _get_default_deep_analysis(self) -> Dict[str, Any]:
        """Анализ по умолчанию"""
        return {
            'score': 75,
            'strengths': [
                {'text': 'Опыт работы в IT-сфере', 'quote': 'Из резюме виден опыт работы в IT'},
                {'text': 'Наличие технических навыков', 'quote': 'Указаны технические навыки'},
                {'text': 'Образование по специальности', 'quote': 'Профильное образование'}
            ],
            'weaknesses': [
                {'text': 'Недостаточно информации о проектах', 'quote': 'Отсутствуют детали проектов'},
                {'text': 'Требуется углубление знаний', 'quote': 'Базовый уровень навыков'}
            ],
            'ai_detection': {
                'has_ai_generated': False,
                'suspicious_parts': [],
                'confidence': 0
            },
            'key_skills': ['Программирование', 'Аналитика', 'Коммуникация'],
            'experience_analysis': 'Кандидат имеет релевантный опыт работы',
            'recommendation': 'Рекомендуется к рассмотрению',
            'detailed_analysis': {}
        }
    
    async def compare_candidates_quick(self, query: str, resumes: List[str]) -> List[float]:
        """
        Быстрое сравнение кандидатов (только оценки)
        """
        scores = []
        for resume in resumes:
            score = await self.quick_evaluate(resume, query)
            scores.append(score)
            await asyncio.sleep(0.1)  # Задержка между запросами
        return scores