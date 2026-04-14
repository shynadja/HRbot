import json
import re
import logging
import time
import random
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import hashlib

from .base_agent import BaseAgent
from .prompts import SINGLE_AGENT_PROMPT
from cache.redis_cache_manager import RedisCacheManager
from vector_store.vector_store import RedisVectorStore
from vector_store.fact_factory import FactStoreFactory

logger = logging.getLogger(__name__)


class SingleAgentContext:
    """Простой контекст для одиночного агента"""
    def __init__(self, data):
        self.raw_data = data
        self.cv_data = self._extract_cv_data(data)
        self.vacancy_data = self._extract_vacancy_data(data)
        self.context_id = self._generate_context_id(data)
    
    def _extract_cv_data(self, data):
        cv_fields = ['idCv', 'positionName', 'experience', 'age', 'gender',
                     'education', 'hardSkills_cv', 'softSkills_cv',
                     'salaryMin_cv', 'salaryMax_cv', 'localityName']
        return {k: data.get(k) for k in cv_fields if k in data}
    
    def _extract_vacancy_data(self, data):
        vacancy_fields = ['idVacancy', 'vacancyName', 'company', 'experienceRequirements',
                          'hardSkills_vacancy', 'softSkills_vacancy', 'responsibilities',
                          'positionRequirements', 'salaryMin_vacancy', 'salaryMax_vacancy']
        return {k: data.get(k) for k in vacancy_fields if k in data}
    
    def _generate_context_id(self, data):
        key_str = f"single_{data.get('idCv', '')}_{data.get('idVacancy', '')}"
        return hashlib.md5(key_str.encode()).hexdigest()[:12]
    
    def get_cache_key(self):
        return hashlib.md5(f"{self.context_id}_single".encode()).hexdigest()


class SingleAgent(BaseAgent):
    """
    Одиночный агент с поддержкой Redis кэша и векторного хранилища фактов
    """
    
    def __init__(self, 
                 api_client=None,
                 cache_manager: Optional[RedisCacheManager] = None,
                 fact_store: Optional[RedisVectorStore] = None,
                 use_cache: bool = True,
                 efficiency_analyzer=None,
                 max_requests_per_minute: int = 8):
        """
        Инициализация одиночного агента с Redis поддержкой
        """
        super().__init__(
            agent_name="single_agent",
            system_prompt=SINGLE_AGENT_PROMPT,
            api_client=api_client,
            cache_manager=cache_manager,
            use_cache=use_cache,
            efficiency_analyzer=efficiency_analyzer
        )
        
        self.fact_store = fact_store or FactStoreFactory.create_single_agent_fact_store()
        self.rate_limiter = self._create_rate_limiter(max_requests_per_minute)
        self.stats = {
            'rate_limits': 0,
            'retries': 0,
            'cache_hits': 0
        }
        
        logger.info("SingleAgent initialized with Redis cache and fact store")
    
    def _create_rate_limiter(self, max_requests_per_minute: int):
        """Создание rate limiter"""
        class RateLimiter:
            def __init__(self, max_req):
                self.max_req = max_req
                self.requests = []
                self.min_interval = 60.0 / max_req
                self.last_request_time = 0
            
            def wait_if_needed(self):
                now = time.time()
                self.requests = [t for t in self.requests if now - t < 60]
                
                if len(self.requests) >= self.max_req:
                    oldest = min(self.requests) if self.requests else now
                    wait_time = 60 - (now - oldest)
                    if wait_time > 0:
                        logger.warning(f"Rate limit reached. Waiting {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        self.requests = []
                
                if self.last_request_time > 0:
                    time_since_last = now - self.last_request_time
                    if time_since_last < self.min_interval:
                        sleep_time = self.min_interval - time_since_last + random.uniform(0.1, 0.3)
                        time.sleep(sleep_time)
                
                self.last_request_time = time.time()
                self.requests.append(time.time())
        
        return RateLimiter(max_requests_per_minute)
    
    def process(self, data: Dict[str, Any]) -> Tuple[Dict, Dict]:
        """Обработка с возвратом (result, token_usage)"""
        start_time = time.time()
        context = SingleAgentContext(data)
        
        logger.info(f"Single agent processing context {context.context_id}")
        
        cache_key = context.get_cache_key()
        if self.use_cache and self.cache_manager:
            cached_result = self.cache_manager.get_by_key(cache_key)
            if cached_result:
                cached_result['from_cache'] = True
                cached_result['processing_time'] = time.time() - start_time
                return cached_result, {'total_tokens': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
        
        try:
            # _process_with_retry теперь возвращает кортеж (result, token_usage)
            result, token_usage = self._process_with_retry(context)
            
            processing_time = time.time() - start_time
            
            result['processing_time'] = processing_time
            result['agent'] = self.agent_name
            result['from_cache'] = False
            result['idCv'] = data.get('idCv')
            result['idVacancy'] = data.get('idVacancy')
            result['total_tokens'] = token_usage.get('total_tokens', 0)
            result['prompt_tokens'] = token_usage.get('prompt_tokens', 0)
            result['completion_tokens'] = token_usage.get('completion_tokens', 0)
            
            if self.use_cache and self.cache_manager and 'error' not in result:
                self.cache_manager.set_by_key(cache_key, result, ttl=86400)
            
            return result, token_usage
            
        except Exception as e:
            logger.error(f"Error in single agent processing: {e}")
            error_result = {
                'error': str(e),
                'agent': self.agent_name,
                'processing_time': time.time() - start_time,
                'from_cache': False,
                'idCv': data.get('idCv'),
                'idVacancy': data.get('idVacancy'),
                'total_tokens': 0,
                'prompt_tokens': 0,
                'completion_tokens': 0
            }
            return error_result, {'total_tokens': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
    
    def _process_with_retry(self, context, attempt: int = 1) -> Tuple[Dict[str, Any], Dict[str, int]]:
        """
        Обработка с повторными попытками при ошибках
        Возвращает кортеж (result, token_usage)
        """
        try:
            # Применяем rate limiting
            self.rate_limiter.wait_if_needed()
            
            # Строим промпт с учетом фактов
            prompt = self.build_prompt(context)
            
            # Логируем длину промпта
            logger.debug(f"Prompt length: {len(prompt)} chars")
            
            # Отправляем запрос к API - возвращает кортеж (response, token_usage)
            api_response, token_usage = self.api_client.analyze(
                prompt,
                temperature=0.1,
                max_tokens=2000
            )
            
            # Логируем, что получили ответ
            logger.debug(f"Received response for context {context.context_id}")
            logger.debug(f"Token usage: {token_usage}")
            
            # Парсим ответ
            result = self.parse_response(api_response, context)
            
            # Добавляем информацию о токенах
            result['total_tokens'] = token_usage.get('total_tokens', 0) if token_usage else 0
            result['prompt_tokens'] = token_usage.get('prompt_tokens', 0) if token_usage else 0
            result['completion_tokens'] = token_usage.get('completion_tokens', 0) if token_usage else 0
            
            if self.efficiency_analyzer:
                self.efficiency_analyzer.log_token_usage(self.agent_name, token_usage if token_usage else {})
            
            return result, token_usage if token_usage else {'total_tokens': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
            
        except Exception as e:
            error_msg = str(e)
            
            # Проверяем на rate limiting
            if '429' in error_msg or 'Rate limited' in error_msg:
                self.stats['rate_limits'] += 1
                
                if attempt < 3:
                    wait_time = 2 * (2 ** (attempt - 1))
                    logger.warning(f"Rate limited on attempt {attempt}. Waiting {wait_time:.1f}s...")
                    time.sleep(wait_time)
                    return self._process_with_retry(context, attempt + 1)
                else:
                    logger.error(f"Rate limited: Failed after {attempt} attempts")
                    error_result = {
                        'error': f'Rate limited after {attempt} attempts',
                        'idCv': context.raw_data.get('idCv'),
                        'idVacancy': context.raw_data.get('idVacancy'),
                        'context_id': context.context_id,
                        'from_cache': False,
                        'total_tokens': 0,
                        'prompt_tokens': 0,
                        'completion_tokens': 0
                    }
                    return error_result, {'total_tokens': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
            
            # Другие ошибки
            elif attempt < 3:
                logger.warning(f"Error on attempt {attempt}: {error_msg}. Retrying in 2s...")
                self.stats['retries'] += 1
                time.sleep(2)
                return self._process_with_retry(context, attempt + 1)
            else:
                logger.error(f"Error after {attempt} attempts: {error_msg}")
                error_result = {
                    'error': error_msg,
                    'idCv': context.raw_data.get('idCv'),
                    'idVacancy': context.raw_data.get('idVacancy'),
                    'context_id': context.context_id,
                    'from_cache': False,
                    'total_tokens': 0,
                    'prompt_tokens': 0,
                    'completion_tokens': 0
                }
                return error_result, {'total_tokens': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
    
    def process_batch(self, items: List[Dict[str, Any]], batch_processor) -> List[Dict[str, Any]]:
        """Обработка батча элементов"""
        logger.info(f"SingleAgent processing batch of {len(items)} items")
        
        results = []
        total = len(items)
        
        for i, item in enumerate(items):
            logger.info(f"Processing item {i+1}/{total}")
            
            # Проверяем кэш
            if self.use_cache and self.cache_manager:
                try:
                    context = SingleAgentContext(item)
                    cache_key = context.get_cache_key()
                    
                    cached = self.cache_manager.get_by_key(cache_key)
                    if cached:
                        cached['from_cache'] = True
                        results.append(cached)
                        self.stats['cache_hits'] += 1
                        logger.debug(f"Cache hit for item {i+1}")
                        continue
                except Exception as e:
                    logger.debug(f"Cache check error: {e}")
            
            # Обрабатываем элемент
            try:
                result, _ = self.process(item)  # Игнорируем token_usage для batch
                results.append(result)
                
                if i < total - 1:
                    delay = 3
                    logger.info(f"Waiting {delay}s before next request...")
                    time.sleep(delay)
                    
            except Exception as e:
                logger.error(f"Error processing item {i+1}: {e}")
                results.append({
                    'error': str(e),
                    'idCv': item.get('idCv'),
                    'idVacancy': item.get('idVacancy'),
                    'from_cache': False,
                    'total_tokens': 0
                })
        
        successful = sum(1 for r in results if r and 'error' not in r)
        failed = sum(1 for r in results if r and 'error' in r)
        cached = sum(1 for r in results if r and r.get('from_cache', False))
        
        logger.info(f"SingleAgent batch completed: {successful} successful, {failed} failed, {cached} from cache")
        
        return results
    
    def _build_query_text(self, context) -> str:
        """
        Формирование текста запроса для векторного поиска
        """
        query_parts = []
        
        # 1. Добавляем должность кандидата
        position = context.cv_data.get('positionName', '')
        if position and position not in ['Не указана', '?', '']:
            # Очищаем от специальных символов
            position_clean = re.sub(r'[^\w\s]', ' ', str(position))
            query_parts.append(position_clean)
        
        # 2. Добавляем вакансию
        vacancy = context.vacancy_data.get('vacancyName', '')
        if vacancy and vacancy not in ['Не указано', '?', '']:
            vacancy_clean = re.sub(r'[^\w\s]', ' ', str(vacancy))
            query_parts.append(vacancy_clean)
        
        # 3. Добавляем ключевые навыки кандидата (первые 3)
        hard_skills = context.cv_data.get('hardSkills_cv', '')
        if hard_skills and hard_skills not in ['Не указаны', '?', '']:
            skills = str(hard_skills).split(',')[:3]
            for skill in skills:
                skill_clean = re.sub(r'[^\w\s]', ' ', skill.strip())
                if skill_clean and len(skill_clean) > 2:
                    query_parts.append(skill_clean)
        
        # 4. Добавляем требования к навыкам из вакансии (первые 3)
        vacancy_skills = context.vacancy_data.get('hardSkills_vacancy', '')
        if vacancy_skills and vacancy_skills not in ['Не указаны', '?', '']:
            skills = str(vacancy_skills).split(',')[:3]
            for skill in skills:
                skill_clean = re.sub(r'[^\w\s]', ' ', skill.strip())
                if skill_clean and len(skill_clean) > 2:
                    query_parts.append(skill_clean)
        
        # Если ничего не собрали, используем общий запрос
        if not query_parts:
            query_text = "программист разработчик"
        else:
            # Берем не более 10 уникальных слов
            all_words = []
            for part in query_parts:
                words = part.split()[:3]  # Не более 3 слов из каждой части
                all_words.extend(words)
            
            # Берем уникальные слова
            unique_words = list(dict.fromkeys(all_words))[:10]
            query_text = " ".join(unique_words)
        
        # Очищаем финальный запрос
        query_text = re.sub(r'\s+', ' ', query_text).strip()
        
        # Ограничиваем длину
        if len(query_text) > 500:
            query_text = query_text[:500]
        
        logger.debug(f"Vector search query: {query_text[:100]}...")
        return query_text
    
    def _get_similar_facts(self, context) -> tuple:
        """
        Получение похожих фактов с использованием ВЕКТОРНОГО поиска
        
        Returns:
            tuple: (successful_facts, failure_facts)
        """
        # Формируем запрос для векторного поиска
        query_text = self._build_query_text(context)
        
        try:
            # Используем ВЕКТОРНЫЙ поиск для успешных фактов
            successful = self.fact_store.get_similar_success_facts(query_text, top_k=3)
            
            # Используем ВЕКТОРНЫЙ поиск для неуспешных фактов
            failure = self.fact_store.get_similar_failure_facts(query_text, top_k=3)
            
            # Логируем результаты с scores
            if successful:
                scores = [f.get('score', 1.0) for f in successful]
                logger.debug(f"Vector search found {len(successful)} success facts (scores: {scores})")
            else:
                logger.debug("No success facts found via vector search")
                
            if failure:
                scores = [f.get('score', 1.0) for f in failure]
                logger.debug(f"Vector search found {len(failure)} failure facts (scores: {scores})")
            else:
                logger.debug("No failure facts found via vector search")
            
            return successful, failure
            
        except Exception as e:
            logger.error(f"Error in vector search: {e}")
            # Fallback на текстовый поиск
            return self._get_similar_facts_text_fallback(context)

    def _get_similar_facts_text_fallback(self, context) -> tuple:
        """
        Fallback на текстовый поиск при ошибках векторного поиска
        """
        logger.info("Using text search fallback for similar facts")
        
        query_words = []
        
        if context.cv_data.get('positionName'):
            pos = context.cv_data['positionName']
            pos_clean = re.sub(r'[^\w\s]', ' ', str(pos))
            words = pos_clean.split()[:2]
            query_words.extend(words)
        
        if context.cv_data.get('hardSkills_cv'):
            skills = str(context.cv_data['hardSkills_cv'])
            skills_clean = re.sub(r'[^\w\s,]', ' ', skills)
            skill_list = [s.strip() for s in skills_clean.split(',')[:2]]
            query_words.extend(skill_list)
        
        if not query_words:
            query_text = "программист разработчик"
        else:
            unique_words = list(dict.fromkeys(query_words))[:5]
            query_text = " ".join(unique_words)
        
        query_text = re.sub(r'\s+', ' ', query_text).strip()
        logger.debug(f"Text search query: {query_text[:100]}")
        
        try:
            # Используем прямой метод текстового поиска, а не search_similar_facts
            # чтобы избежать рекурсии
            successful = self.fact_store._text_search_fallback(query_text, top_k=2, status_filter="success")
            failure = self.fact_store._text_search_fallback(query_text, top_k=2, status_filter="failure")
            return successful, failure
        except Exception as e:
            logger.error(f"Text search fallback failed: {e}")
            return [], []
    
    def _format_facts_for_prompt(self, facts: List[Dict[str, Any]], status: str) -> str:
        """
        Форматирование фактов для вставки в промпт с учетом score
        """
        if not facts:
            return "Нет похожих примеров"
        
        formatted = []
        for i, fact in enumerate(facts, 1):
            parts = []
            
            # Добавляем должность
            if fact.get('position_name'):
                parts.append(f"Должность: {fact['position_name'][:100]}")
            
            # Добавляем опыт
            if fact.get('experience'):
                parts.append(f"Опыт: {fact['experience']} лет")
            
            # Добавляем hard skills
            if fact.get('hard_skills'):
                skills = fact['hard_skills'][:200]
                parts.append(f"Hard Skills: {skills}")
            
            # Добавляем soft skills
            if fact.get('soft_skills'):
                soft = fact['soft_skills'][:150]
                parts.append(f"Soft Skills: {soft}")
            
            # Добавляем индикатор схожести на основе score
            similarity_score = fact.get('score', 1.0)
            if similarity_score < 0.5:
                similarity_indicator = "очень похож"
            elif similarity_score < 0.7:
                similarity_indicator = "похож"
            else:
                similarity_indicator = ""
            
            if parts:
                formatted.append(f"{i}. {' | '.join(parts)}{similarity_indicator}")
        
        if not formatted:
            return "Нет данных"
        
        result = "\n".join(formatted)
        
        # Добавляем заголовок с пояснением
        if status == "success":
            header = "Похожие успешные примеры (найдены через векторный поиск):\n"
        else:
            header = "Похожие неуспешные примеры (найдены через векторный поиск):\n"
        
        return header + result
    
    def build_prompt(self, context) -> str:
        """
        Построение промпта с использованием векторного поиска похожих фактов
        """
        # Получаем похожие факты через векторный поиск
        successful_facts, failure_facts = self._get_similar_facts(context)
        
        # Форматируем для промпта
        successful_examples = self._format_facts_for_prompt(successful_facts, "success")
        failure_examples = self._format_facts_for_prompt(failure_facts, "failure")
        
        prompt_data = {
            'positionName': self._truncate(context.cv_data.get('positionName', 'Не указана')),
            'experience': context.cv_data.get('experience', 0),
            'age': context.cv_data.get('age', 'Не указан'),
            'education': self._truncate(context.cv_data.get('education', 'Не указано')),
            'hardSkills_cv': self._truncate(context.cv_data.get('hardSkills_cv', 'Не указаны')),
            'softSkills_cv': self._truncate(context.cv_data.get('softSkills_cv', 'Не указаны')),
            'salaryMin_cv': context.cv_data.get('salaryMin_cv', '?'),
            'salaryMax_cv': context.cv_data.get('salaryMax_cv', '?'),
            'localityName': context.cv_data.get('localityName', 'Не указана'),
            'vacancyName': self._truncate(context.vacancy_data.get('vacancyName', 'Не указано')),
            'company': context.vacancy_data.get('company', 'Не указана'),
            'experienceRequirements': context.vacancy_data.get('experienceRequirements', 'Не указан'),
            'hardSkills_vacancy': self._truncate(context.vacancy_data.get('hardSkills_vacancy', 'Не указаны')),
            'softSkills_vacancy': self._truncate(context.vacancy_data.get('softSkills_vacancy', 'Не указаны')),
            'responsibilities': self._truncate(context.vacancy_data.get('responsibilities', 'Не указаны')),
            'positionRequirements': self._truncate(context.vacancy_data.get('positionRequirements', 'Не указаны')),
            'salaryMin_vacancy': context.vacancy_data.get('salaryMin_vacancy', '?'),
            'salaryMax_vacancy': context.vacancy_data.get('salaryMax_vacancy', '?'),
            'successful_examples': successful_examples,
            'failure_examples': failure_examples
        }
        
        # Используем стандартный промпт
        return self.system_prompt.format(**prompt_data)
    
    def _validate_and_fix_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Валидация и исправление результата"""
        quick_score = None
        if 'quick_assessment' in result:
            qa = result['quick_assessment']
            if isinstance(qa, dict):
                quick_score = qa.get('score')
        
        final_verdict = None
        if 'final_verdict' in result:
            fv = result['final_verdict']
            if isinstance(fv, dict):
                final_verdict = fv.get('decision')
            elif isinstance(fv, str):
                final_verdict = fv
        
        if quick_score is not None and quick_score >= 70:
            if final_verdict and final_verdict.lower() == 'отказ':
                logger.warning(f"Fixed inconsistency: score={quick_score} -> verdict changed to 'Приглашение'")
                if isinstance(result['final_verdict'], dict):
                    result['final_verdict']['decision'] = 'Приглашение'
                else:
                    result['final_verdict'] = {'decision': 'Приглашение'}
        
        return result
    
    def parse_response(self, response: Dict[str, Any], context, token_usage: Optional[Dict] = None) -> Dict[str, Any]:
        """Парсинг ответа с улучшенной обработкой ошибок"""
        try:
            content = response['choices'][0]['message']['content']
        
            # Логируем первые 500 символов для отладки
            logger.debug(f"Raw response (first 500 chars): {content[:500]}")
            
            # Очищаем ответ от markdown
            content = re.sub(r'```json\s*', '', content)
            content = re.sub(r'```\s*', '', content)
            content = re.sub(r'^json\s*', '', content, flags=re.IGNORECASE)
            
            # Удаляем BOM если есть
            content = content.strip().lstrip('\ufeff')
        
            # Экранируем управляющие символы внутри строк
            content = self._escape_control_characters(content)
            
            # Ищем JSON объект в тексте
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
        
            if json_match:
                json_str = json_match.group()
                
                # Пробуем парсить с несколькими попытками
                result = self._safe_json_loads(json_str)
                
                if result:
                    result = self._validate_and_fix_result(result)
                    result['context_id'] = context.context_id
                    # Добавляем информацию о токенах, если есть
                    if token_usage:
                        result['prompt_tokens'] = token_usage.get('prompt_tokens', 0)
                        result['completion_tokens'] = token_usage.get('completion_tokens', 0)
                        result['total_tokens'] = token_usage.get('total_tokens', 0)
                    return result
        
            # Если не удалось найти JSON, пробуем извлечь данные вручную
            extracted = self._manual_extract_data(content)
            if extracted:
                extracted = self._validate_and_fix_result(extracted)
                extracted['context_id'] = context.context_id
                logger.warning(f"Manual extraction used for context {context.context_id}")
                return extracted
        
            # Если ничего не помогло, возвращаем fallback
            logger.warning(f"Could not parse response for context {context.context_id}")
            return self._create_fallback_response(context)
                
        except Exception as e:
            logger.error(f"Error parsing response: {e}")
            logger.debug(f"Failed content: {content[:500] if 'content' in locals() else 'No content'}")
            return self._create_error_response(context, str(e))

    def _escape_control_characters(self, text: str) -> str:
        """Экранирование управляющих символов в строке"""
        import re
    
        # Функция для экранирования внутри строк JSON
        def escape_in_string(match):
            """Экранируем управляющие символы внутри строковых значений"""
            string_content = match.group(1)
            # Заменяем управляющие символы на экранированные
            escaped = string_content.replace('\\', '\\\\')
            escaped = escaped.replace('\n', '\\n')
            escaped = escaped.replace('\r', '\\r')
            escaped = escaped.replace('\t', '\\t')
            escaped = escaped.replace('"', '\\"')
            return f'"{escaped}"'
    
        # Находим все строковые значения и экранируем их
        pattern = r'"([^"\\]*(?:\\.[^"\\]*)*)"'
    
        try:
            for _ in range(3):
                text = re.sub(pattern, escape_in_string, text)
        except Exception as e:
            logger.debug(f"Error in escape_control_characters: {e}")
        
        return text

    def _safe_json_loads(self, json_str: str) -> Optional[Dict[str, Any]]:
        """Безопасная загрузка JSON с несколькими попытками"""
    
        # Попытка 1: Прямой парсинг
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.debug(f"Direct JSON parse failed: {e}")
    
        # Попытка 2: Удаляем недопустимые управляющие символы
        try:
            cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', json_str)
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
    
        # Попытка 3: Исправляем распространенные ошибки
        try:
            fixed = re.sub(r'(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_str)
            fixed = re.sub(r":\s*'([^']*)'\s*([,}])", r': "\1"\2', fixed)
            fixed = re.sub(r',\s*}', '}', fixed)
            fixed = re.sub(r',\s*]', ']', fixed)
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass
    
        # Попытка 4: Используем ast.literal_eval как fallback
        try:
            import ast
            fixed = json_str.replace('true', 'True').replace('false', 'False').replace('null', 'None')
            result = ast.literal_eval(fixed)
            if isinstance(result, dict):
                return result
        except Exception:
            pass
        
        return None

    def _manual_extract_data(self, content: str) -> Optional[Dict[str, Any]]:
        """Ручное извлечение данных из текста"""
        result = {}
    
        # 1. Извлечение quick_assessment score
        score_patterns = [
            r'(?:score|оценк[аи]|балл)[^\d]*(\d{1,3})',
            r'"score"\s*:\s*(\d{1,3})',
            r'(\d{1,3})\s*(?:из|изо?|/)\s*100',
            r'(\d{1,3})\s*%',
        ]
    
        for pattern in score_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                try:
                    score = int(match.group(1))
                    if 0 <= score <= 100:
                        result['quick_assessment'] = {'score': score}
                        break
                except:
                    pass
    
        if 'quick_assessment' not in result:
            numbers = re.findall(r'\b([0-9]{1,3})\b', content)
            for num in numbers:
                try:
                    score = int(num)
                    if 40 <= score <= 100:
                        result['quick_assessment'] = {'score': score}
                        break
                except:
                    pass
    
        # 2. Извлечение strengths
        strengths = []
        strength_patterns = [
            r'(?:сильн[а-я]+ сторон[а-я]+)[^\w]*([^.!?]{10,150})',
            r'(?:strengths?)[^\w]*([^.!?]{10,150})',
            r'[•\-*]\s*([^.!?]{10,100})'
        ]
    
        for pattern in strength_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches[:3]:
                description = match.strip()
                if len(description) > 10:
                    strengths.append({'description': description[:200]})
            if strengths:
                break
    
        if strengths:
            result['strengths'] = strengths[:3]
        
        # 3. Извлечение improvements
        improvements = []
        improvement_patterns = [
            r'(?:улучшени[а-я]+|недостат[а-я]+|рекомендац[а-я]+)[^\w]*([^.!?]{10,150})',
            r'(?:improvements?|weaknesses?)[^\w]*([^.!?]{10,150})'
        ]
    
        for pattern in improvement_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches[:2]:
                text = match.strip()
                if len(text) > 10:
                    improvements.append({
                        'area': 'Область для улучшения',
                        'suggestion': text[:200]
                    })
            if improvements:
                break
    
        if improvements:
            result['improvements'] = improvements[:2]
    
        # 4. Извлечение final_verdict
        if re.search(r'приглашени[а-я]+', content, re.IGNORECASE):
            result['final_verdict'] = {'decision': 'Приглашение'}
        elif re.search(r'отказ', content, re.IGNORECASE):
            result['final_verdict'] = {'decision': 'Отказ'}
        elif re.search(r'invite|accept|hire', content, re.IGNORECASE):
            result['final_verdict'] = {'decision': 'Приглашение'}
        elif re.search(r'reject|decline', content, re.IGNORECASE):
            result['final_verdict'] = {'decision': 'Отказ'}
        else:
            if 'quick_assessment' in result:
                if result['quick_assessment']['score'] >= 70:
                    result['final_verdict'] = {'decision': 'Приглашение'}
                else:
                    result['final_verdict'] = {'decision': 'Отказ'}
        
        # 5. Извлечение reason
        reason_patterns = [
            r'(?:причин[аы]|пояснени[ея]|обосновани[ея])[^\w]*([^.!?]{20,300}[.!?])',
            r'(?:поэтому|таким образом|следовательно)[^\w]*([^.!?]{20,300}[.!?])',
            r'(?:не подходит|соответствует)[^\w]*([^.!?]{20,300}[.!?])'
        ]
        
        for pattern in reason_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                reason = match.group(1).strip()
                if len(reason) > 20:
                    if 'final_verdict' not in result:
                        result['final_verdict'] = {}
                    result['final_verdict']['reason'] = reason[:500]
                    break
    
        if result:
            logger.info(f"Manual extraction found: quick_assessment={result.get('quick_assessment', {}).get('score')}, "
                    f"strengths={len(result.get('strengths', []))}, "
                    f"improvements={len(result.get('improvements', []))}, "
                    f"verdict={result.get('final_verdict', {}).get('decision')}")
            return result
        
        return None
    
    def _create_fallback_response(self, context) -> Dict:
        return {
            'quick_assessment': {'score': 50},
            'strengths': [{'description': 'Анализ временно недоступен'}],
            'improvements': [{'area': 'Анализ недоступен', 'suggestion': 'Повторите попытку позже'}],
            'final_verdict': {'decision': 'Отказ'},
            'context_id': context.context_id,
            'note': 'Fallback response',
            'total_tokens': 0,
            'prompt_tokens': 0,
            'completion_tokens': 0
        }
    
    def _create_error_response(self, context, error_msg: str) -> Dict:
        return {
            'error': error_msg,
            'context_id': context.context_id,
            'total_tokens': 0,
            'prompt_tokens': 0,
            'completion_tokens': 0
        }
    
    def _truncate(self, text: str, max_length: int = 300) -> str:
        if not text or text in ['Не указано', 'Не указаны', '?']:
            return 'Не указано'
        text = str(text)
        return text[:max_length] + '...' if len(text) > max_length else text