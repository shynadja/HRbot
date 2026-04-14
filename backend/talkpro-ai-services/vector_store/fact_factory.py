import re
import pandas as pd
import logging
from typing import Optional
from .vector_store import RedisVectorStore

logger = logging.getLogger(__name__)


class FactStoreFactory:
    """Фабрика для создания хранилищ фактов"""
    
    @staticmethod
    def create_single_agent_fact_store(redis_url: str = "redis://localhost:6379", api_client=None) -> RedisVectorStore:
        """Создание хранилища фактов для одиночного агента"""
        return RedisVectorStore(
            redis_url=redis_url,
            index_name="facts_single_agent",
            vector_dim=384,
            api_client=api_client
        )
    
    @staticmethod
    def create_multi_agent_fact_store(redis_url: str = "redis://localhost:6379", api_client=None) -> RedisVectorStore:
        """Создание хранилища фактов для мульти-агента"""
        return RedisVectorStore(
            redis_url=redis_url,
            index_name="facts_multi_agent",
            vector_dim=384,
            api_client=api_client
        )
    
    @staticmethod
    def load_facts_from_csv(
        fact_store: RedisVectorStore,
        csv_path: str,
        delimiter: str = ',',
        limit: Optional[int] = None,
        batch_size: int = 100
    ) -> int:
        """
        Загрузка фактов из CSV файла с поддержкой больших файлов
        
        Args:
            fact_store: Хранилище фактов
            csv_path: Путь к CSV файлу
            delimiter: Разделитель
            limit: Ограничение на количество записей (None - все записи)
            batch_size: Размер батча для загрузки
            
        Returns:
            Количество загруженных фактов
        """
        try:
            # Загружаем весь файл
            df = pd.read_csv(csv_path, sep=delimiter, encoding='utf-8-sig', low_memory=False)
            logger.info(f"Loaded {len(df)} rows from {csv_path}")
            
            # Фильтруем по статусу
            if 'cv_status' in df.columns:
                original_count = len(df)
                df = df[df['cv_status'].isin(['Приглашение', 'Отказ'])]
                logger.info(f"After status filter: {len(df)} rows (filtered out {original_count - len(df)})")
            else:
                logger.warning("Column 'cv_status' not found")
                return 0
            
            if limit:
                df = df.head(limit)
                logger.info(f"Limited to {limit} rows")
            
            # Загружаем батчами
            count = 0
            errors = 0
            total_rows = len(df)
            
            for start_idx in range(0, total_rows, batch_size):
                end_idx = min(start_idx + batch_size, total_rows)
                batch_df = df.iloc[start_idx:end_idx]
                
                logger.info(f"Loading batch {start_idx//batch_size + 1}/{(total_rows + batch_size - 1)//batch_size} "
                           f"({start_idx}-{end_idx} of {total_rows})")
                
                for idx, row in batch_df.iterrows():
                    try:
                        fact_data = {}
                        for col in df.columns:
                            value = row[col]
                            # Обработка NaN значений
                            if pd.isna(value):
                                fact_data[col] = None
                            else:
                                # Очищаем строки от управляющих символов
                                if isinstance(value, str):
                                    # Удаляем управляющие символы
                                    value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
                                    # Ограничиваем длину для текстовых полей
                                    if col in ['hardSkills_cv', 'softSkills_cv', 'responsibilities', 'positionRequirements']:
                                        value = value[:5000]
                                    elif col in ['workExperienceList']:
                                        value = value[:3000]
                                    else:
                                        value = value[:1000]
                                fact_data[col] = value
                        
                        # Добавляем факт в хранилище
                        fact_store.add_fact(fact_data)
                        count += 1
                        
                        if count % 100 == 0:
                            logger.info(f"Loaded {count} facts...")
                            
                    except Exception as e:
                        errors += 1
                        logger.warning(f"Error loading row {idx}: {e}")
                        continue
                
                # Небольшая задержка между батчами для Redis
                if end_idx < total_rows:
                    import time
                    time.sleep(0.5)
            
            logger.info(f"Loaded {count} facts into store, errors: {errors}")
            
            # Выводим статистику
            stats = fact_store.get_stats()
            logger.info(f"Store stats: {stats}")
            
            return count
            
        except Exception as e:
            logger.error(f"Error loading facts: {e}")
            import traceback
            traceback.print_exc()
            return 0
    
    @staticmethod
    def clear_all_facts(fact_store: RedisVectorStore) -> int:
        """Очистка всех фактов из хранилища"""
        return fact_store.clear_all()