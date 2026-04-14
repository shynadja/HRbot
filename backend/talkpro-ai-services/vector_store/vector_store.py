import json
import hashlib
import logging
import re
from typing import List, Dict, Any, Optional
import numpy as np
import redis
from redis.commands.search.field import TextField, TagField, VectorField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query

logger = logging.getLogger(__name__)


class GigaChatEmbeddings:
    """Класс для получения эмбеддингов через GigaChat API"""
    
    def __init__(self, api_client=None):
        self.api_client = api_client
        self._cache = {}
        self._vector_dim = 384  # Размерность по умолчанию
        logger.info(f"GigaChatEmbeddings initialized with api_client: {api_client is not None}")
    
    def get_embedding(self, text: str, dim: int = 384) -> List[float]:
        """Получение эмбеддинга через GigaChat или fallback"""
        self._vector_dim = dim
        
        # Проверяем кэш
        text_hash = hashlib.md5(text.encode()).hexdigest()
        if text_hash in self._cache:
            return self._cache[text_hash]
        
        # Если есть API клиент, используем его
        if self.api_client:
            try:
                # Пытаемся получить эмбеддинг через GigaChat
                response = self.api_client.embeddings(text)
                
                if response and 'data' in response and len(response['data']) > 0:
                    embedding = response['data'][0].get('embedding', [])
                    
                    if embedding and len(embedding) > 0:
                        # Приводим к нужной размерности
                        if len(embedding) > dim:
                            embedding = embedding[:dim]
                        elif len(embedding) < dim:
                            # Дополняем нулями если нужно
                            embedding = embedding + [0.0] * (dim - len(embedding))
                        
                        # Нормализуем
                        arr = np.array(embedding, dtype=np.float32)
                        norm = np.linalg.norm(arr)
                        if norm > 0:
                            arr = arr / norm
                        
                        result = arr.tolist()
                        self._cache[text_hash] = result
                        logger.debug(f"Got embedding from GigaChat, dimension: {len(result)}")
                        return result
                        
            except Exception as e:
                logger.warning(f"Failed to get embedding from GigaChat: {e}, using fallback")
        
        # Fallback: хэш-основанный эмбеддинг
        return self._fallback_embedding(text, dim)
    
    def _fallback_embedding(self, text: str, dim: int = 384) -> List[float]:
        """Fallback метод для создания эмбеддинга на основе хэша"""
        # Используем несколько хэшей для лучшего распределения
        hash_funcs = [hashlib.md5, hashlib.sha1, hashlib.sha256]
        
        vector = []
        text_bytes = text.encode('utf-8')
        
        for i in range(dim):
            # Выбираем хэш-функцию на основе индекса
            hash_func = hash_funcs[i % len(hash_funcs)]
            hash_obj = hash_func(text_bytes + str(i).encode())
            hash_bytes = hash_obj.digest()
            
            # Берем несколько байт и комбинируем
            val = 0
            for j, byte in enumerate(hash_bytes[:4]):
                val = (val << 8) | byte
            
            # Нормализуем в диапазон [0, 1]
            normalized = (val % 10000) / 10000.0
            vector.append(normalized)
        
        # Нормализуем вектор
        arr = np.array(vector, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        
        result = arr.tolist()
        text_hash = hashlib.md5(text.encode()).hexdigest()
        self._cache[text_hash] = result
        
        logger.debug(f"Generated fallback embedding, dimension: {len(result)}")
        return result


class RedisVectorStore:
    """
    Векторное хранилище на основе Redis Stack с поддержкой KNN-поиска
    """
    
    def __init__(self, 
                 redis_url: str = "redis://localhost:6379",
                 index_name: str = "facts_idx",
                 vector_dim: int = 384,
                 api_client=None):
        """
        Инициализация векторного хранилища
        
        Args:
            redis_url: URL для подключения к Redis
            index_name: Имя индекса для поиска
            vector_dim: Размерность векторов
            api_client: Клиент GigaChat API для получения эмбеддингов
        """
        self.redis_client = redis.from_url(redis_url, decode_responses=False)
        self.index_name = index_name
        self.vector_dim = vector_dim
        
        # Инициализируем эмбеддер с API клиентом
        self.embedder = GigaChatEmbeddings(api_client)
        
        # Проверка подключения
        try:
            self.redis_client.ping()
            logger.info(f"Connected to Redis at {redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
        
        # Создаем индекс с векторным полем
        self._create_index()
        
        logger.info(f"RedisVectorStore initialized with index '{index_name}', vector_dim={vector_dim}")
    
    def _create_index(self):
        """Создание индекса с векторным полем для KNN-поиска"""
        try:
            # Проверяем существование индекса
            self.redis_client.ft(self.index_name).info()
            logger.info(f"Index '{self.index_name}' already exists")
        except:
            # Создаем схему с векторным полем
            schema = (
                TextField("resume_text"),
                TextField("position_name"),
                TextField("hard_skills"),
                TextField("soft_skills"),
                TagField("status"),
                TextField("idCv"),
                TextField("idVacancy"),
                TextField("vacancy_name"),
                TextField("experience"),
                TagField("education_type"),
                VectorField(
                    "vector",
                    "FLAT",
                    {
                        "TYPE": "FLOAT32",
                        "DIM": self.vector_dim,
                        "DISTANCE_METRIC": "COSINE"
                    }
                )
            )
            
            self.redis_client.ft(self.index_name).create_index(
                schema,
                definition=IndexDefinition(
                    prefix=[f"{self.index_name}:"],
                    index_type=IndexType.HASH
                )
            )
            logger.info(f"Vector index '{self.index_name}' created with dimension {self.vector_dim}")
    
    def _prepare_resume_text(self, fact_data: Dict[str, Any]) -> str:
        """Подготовка текста резюме с безопасным преобразованием типов"""
        def safe_str(value, max_len=500):
            if value is None:
                return ""
            if isinstance(value, (int, float)):
                return str(value)
            if isinstance(value, str):
                # Очищаем от управляющих символов
                value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
            return str(value)[:max_len]
        
        parts = []
        
        position = fact_data.get("positionName")
        if position and str(position) not in ['nan', 'None', '']:
            parts.append(f"Должность: {safe_str(position, 200)}")
        
        experience = fact_data.get("experience")
        if experience and str(experience) not in ['nan', 'None', '']:
            parts.append(f"Опыт: {safe_str(experience)} лет")
        
        hard_skills = fact_data.get("hardSkills_cv")
        if hard_skills and str(hard_skills) not in ['nan', 'None', '']:
            parts.append(f"Hard Skills: {safe_str(hard_skills, 500)}")
        
        soft_skills = fact_data.get("softSkills_cv")
        if soft_skills and str(soft_skills) not in ['nan', 'None', '']:
            parts.append(f"Soft Skills: {safe_str(soft_skills, 500)}")
        
        education = fact_data.get("education")
        if education and str(education) not in ['nan', 'None', '']:
            parts.append(f"Образование: {safe_str(education, 200)}")
        
        vacancy = fact_data.get("vacancyName")
        if vacancy and str(vacancy) not in ['nan', 'None', '']:
            parts.append(f"Вакансия: {safe_str(vacancy, 200)}")
        
        return " | ".join(parts) if parts else "Нет данных"
    
    def _vector_to_bytes(self, vector: List[float]) -> bytes:
        """Преобразование вектора в байты для Redis"""
        return np.array(vector, dtype=np.float32).tobytes()
    
    def add_fact(self, fact_data: Dict[str, Any]) -> str:
        """Добавление факта с вектором"""
        # Генерируем ID
        id_cv = fact_data.get("idCv", "")
        id_vacancy = fact_data.get("idVacancy", "")
        
        if isinstance(id_cv, (int, float)):
            id_cv = str(int(id_cv))
        if isinstance(id_vacancy, (int, float)):
            id_vacancy = str(int(id_vacancy))
        
        fact_id = hashlib.md5(f"{id_cv}_{id_vacancy}".encode()).hexdigest()
        key = f"{self.index_name}:{fact_id}"
        
        # Подготавливаем текст
        resume_text = self._prepare_resume_text(fact_data)
        
        # Получаем эмбеддинг для векторного поиска
        try:
            vector = self.embedder.get_embedding(resume_text, self.vector_dim)
            vector_bytes = self._vector_to_bytes(vector)
            logger.debug(f"Generated embedding for fact {fact_id}, dim={len(vector)}")
        except Exception as e:
            logger.warning(f"Failed to get embedding: {e}, using zeros")
            vector_bytes = np.zeros(self.vector_dim, dtype=np.float32).tobytes()
        
        # Определяем статус
        status_value = fact_data.get("cv_status", "")
        status = "success" if "Приглашение" in str(status_value) else "failure"
        
        def safe_field(value, max_len=500):
            if value is None:
                return ""
            if isinstance(value, (int, float)):
                return str(value)
            text = str(value)
            text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
            return text[:max_len]
        
        # Сохраняем в Redis с вектором
        try:
            self.redis_client.hset(key, mapping={
                "vector": vector_bytes,
                "resume_text": safe_field(resume_text, 1000),
                "position_name": safe_field(fact_data.get("positionName", ""), 200),
                "hard_skills": safe_field(fact_data.get("hardSkills_cv", ""), 500),
                "soft_skills": safe_field(fact_data.get("softSkills_cv", ""), 500),
                "status": status,
                "idCv": safe_field(id_cv, 100),
                "idVacancy": safe_field(id_vacancy, 100),
                "vacancy_name": safe_field(fact_data.get("vacancyName", ""), 200),
                "experience": safe_field(fact_data.get("experience", ""), 50),
                "education_type": safe_field(fact_data.get("education", ""), 50)
            })
            logger.debug(f"Fact added: {fact_id}, status: {status}")
        except Exception as e:
            logger.error(f"Error adding fact: {e}")
        
        return fact_id
    
    def _escape_query(self, text: str) -> str:
        """Экранирование специальных символов для Redis поиска"""
        if not text:
            return ""
        
        # Удаляем управляющие символы
        text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
        
        # Заменяем специальные символы на пробелы
        special_chars = r'[\-+!~*?:\\/\[\]{}()"\'`]'
        text = re.sub(special_chars, ' ', text)
        
        # Удаляем множественные пробелы
        text = re.sub(r'\s+', ' ', text)
        
        # Ограничиваем длину
        text = text[:200].strip()
        
        if not text or len(text) < 3:
            return "программист"
        
        return text

    def search_similar_facts(self, 
                            query_text: str, 
                            top_k: int = 5,
                            status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Поиск похожих фактов с использованием векторного (KNN) поиска
        
        Args:
            query_text: Текст запроса
            top_k: Количество результатов
            status_filter: Фильтр по статусу ('success' или 'failure')
            
        Returns:
            Список похожих фактов
        """
        if not query_text or len(query_text.strip()) == 0:
            return self._get_recent_facts(top_k, status_filter)
        
        # Очищаем запрос
        query_cleaned = self._escape_query(query_text)
        
        try:
            # Получаем эмбеддинг для запроса
            query_embedding = self.embedder.get_embedding(query_cleaned, self.vector_dim)
            query_vector_bytes = self._vector_to_bytes(query_embedding)
            
            # Формируем KNN-запрос
            if status_filter:
                base_query = f"@status:{{{status_filter}}}"
                knn_query = f"{base_query} => [KNN {top_k} @vector $vec AS score]"
            else:
                knn_query = f"* => [KNN {top_k} @vector $vec AS score]"
            
            q = Query(knn_query).return_fields(
                "score", "resume_text", "status", "idCv", "idVacancy", 
                "position_name", "hard_skills", "soft_skills", 
                "experience", "education_type", "vacancy_name"
            ).dialect(2)
            
            # Выполняем поиск с параметром вектора
            results = self.redis_client.ft(self.index_name).search(
                q, 
                query_params={"vec": query_vector_bytes}
            )
            
            # Преобразуем результаты
            facts = []
            for doc in results.docs:
                fact = self._doc_to_fact(doc)
                facts.append(fact)
            
            logger.debug(f"Vector search found {len(facts)} facts for query: {query_cleaned[:50]}...")
            
            if facts:
                return facts[:top_k]
            
        except Exception as e:
            logger.warning(f"Vector search failed: {e}, falling back to text search")
            # Fallback на текстовый поиск
            return self._text_search_fallback(query_cleaned, top_k, status_filter)
        
        # Если ничего не нашли, пробуем текстовый поиск
        return self._text_search_fallback(query_cleaned, top_k, status_filter)
    
    def _text_search_fallback(self, 
                              query_text: str, 
                              top_k: int = 5,
                              status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fallback на текстовый поиск при ошибках векторного поиска
        """
        if not query_text or len(query_text.strip()) < 3:
            return self._get_recent_facts(top_k, status_filter)
        
        # Разбиваем запрос на слова для поиска
        words = query_text.split()[:5]
        
        for word in words:
            if len(word) < 3:
                continue
                
            try:
                # Пробуем разные варианты поиска
                search_patterns = [
                    f"@resume_text:*{word}*",
                    f"@position_name:*{word}*",
                    f"@hard_skills:*{word}*",
                ]
                
                for pattern in search_patterns:
                    try:
                        if status_filter:
                            q = Query(f"@status:{{{status_filter}}} {pattern}").paging(0, top_k)
                        else:
                            q = Query(pattern).paging(0, top_k)
                        
                        results = self.redis_client.ft(self.index_name).search(q)
                        
                        if results.docs:
                            facts = []
                            for doc in results.docs:
                                fact = self._doc_to_fact(doc)
                                fact["score"] = 0.8  # Фиксированный score для текстового поиска
                                facts.append(fact)
                            
                            logger.debug(f"Text search found {len(facts)} facts with pattern: {pattern}")
                            return facts[:top_k]
                            
                    except Exception as e:
                        logger.debug(f"Search pattern '{pattern}' failed: {e}")
                        continue
                        
            except Exception as e:
                logger.debug(f"Word search '{word}' failed: {e}")
                continue
        
        # Если ничего не нашли, возвращаем последние факты
        return self._get_recent_facts(top_k, status_filter)
    
    def _doc_to_fact(self, doc) -> Dict[str, Any]:
        """Преобразование документа Redis в словарь факта"""
        fact = {
            "score": float(getattr(doc, 'score', 1.0)),
            "resume_text": self._decode_field(getattr(doc, 'resume_text', ''))[:500],
            "status": self._decode_field(getattr(doc, 'status', '')),
            "idCv": self._decode_field(getattr(doc, 'idCv', '')),
            "idVacancy": self._decode_field(getattr(doc, 'idVacancy', '')),
            "position_name": self._decode_field(getattr(doc, 'position_name', ''))[:100],
            "hard_skills": self._decode_field(getattr(doc, 'hard_skills', ''))[:200],
            "soft_skills": self._decode_field(getattr(doc, 'soft_skills', ''))[:200],
            "experience": self._decode_field(getattr(doc, 'experience', '')),
            "education_type": self._decode_field(getattr(doc, 'education_type', '')),
            "vacancy_name": self._decode_field(getattr(doc, 'vacancy_name', ''))[:100]
        }
        return fact
    
    def _decode_field(self, value) -> str:
        """Декодирование поля из байт в строку"""
        if value is None:
            return ""
        if isinstance(value, bytes):
            try:
                return value.decode('utf-8', errors='ignore')
            except:
                return str(value)
        return str(value)

    def _get_recent_facts(self, top_k: int = 3, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Получение последних добавленных фактов"""
        try:
            pattern = f"{self.index_name}:*"
            keys = self.redis_client.keys(pattern)
            
            if not keys:
                return []
            
            facts = []
            for key in keys[:top_k * 5]:  # Проверяем больше ключей для фильтрации
                try:
                    data = self.redis_client.hgetall(key)
                    if not data:
                        continue
                    
                    status = self._decode_field(data.get(b'status', b''))
                    if status_filter and status != status_filter:
                        continue
                    
                    fact = {
                        "score": 1.0,
                        "resume_text": self._decode_field(data.get(b'resume_text', b''))[:500],
                        "status": status,
                        "idCv": self._decode_field(data.get(b'idCv', b'')),
                        "idVacancy": self._decode_field(data.get(b'idVacancy', b'')),
                        "position_name": self._decode_field(data.get(b'position_name', b''))[:100],
                        "hard_skills": self._decode_field(data.get(b'hard_skills', b''))[:200],
                        "soft_skills": self._decode_field(data.get(b'soft_skills', b''))[:200],
                        "experience": self._decode_field(data.get(b'experience', b'')),
                        "education_type": self._decode_field(data.get(b'education_type', b'')),
                        "vacancy_name": self._decode_field(data.get(b'vacancy_name', b''))[:100]
                    }
                    
                    facts.append(fact)
                    
                    if len(facts) >= top_k:
                        break
                        
                except Exception as e:
                    logger.debug(f"Error processing key {key}: {e}")
                    continue
            
            logger.debug(f"Retrieved {len(facts)} recent facts")
            return facts
            
        except Exception as e:
            logger.error(f"Error getting recent facts: {e}")
            return []
    
    def get_similar_success_facts(self, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Получение похожих успешных фактов"""
        return self.search_similar_facts(query_text, top_k, status_filter="success")
    
    def get_similar_failure_facts(self, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Получение похожих неуспешных фактов"""
        return self.search_similar_facts(query_text, top_k, status_filter="failure")
    
    def get_stats(self) -> Dict[str, Any]:
        """Получение статистики"""
        try:
            info = self.redis_client.ft(self.index_name).info()
            return {
                "num_docs": int(info.get("num_docs", 0)),
                "index_name": self.index_name,
                "vector_dim": self.vector_dim,
                "indexing": str(info.get("indexing", {}))
            }
        except Exception as e:
            return {"error": str(e)}
    
    def clear_all(self) -> int:
        """Очистка всех записей"""
        try:
            pattern = f"{self.index_name}:*"
            keys = self.redis_client.keys(pattern)
            count = len(keys)
            if keys:
                self.redis_client.delete(*keys)
            logger.info(f"Cleared {count} facts from store")
            return count
        except Exception as e:
            logger.error(f"Error clearing store: {e}")
            return 0