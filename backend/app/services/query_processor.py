import re
from typing import Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)

class QueryProcessor:
    """
    Обработчик поисковых запросов - извлекает фильтры из свободного текста
    """
    
    # Словари для распознавания
    EXPERIENCE_PATTERNS = {
        r'без опыта|нет опыта': 'noExperience',
        r'от\s+(\d+)\s+до\s+(\d+)\s+лет': 'between',
        r'более\s+(\d+)\s+лет|больше\s+(\d+)\s+лет': 'moreThan',
        r'опыт\s+(\d+)[\s-]*(\d*)\s*лет': 'range'
    }
    
    CITIES = [
        'москва', 'спб', 'питер', 'санкт-петербург', 'екатеринбург',
        'новосибирск', 'казань', 'нижний новгород', 'самара', 'омск',
        'челябинск', 'ростов-на-дону', 'уфа', 'красноярск', 'пермь',
        'воронеж', 'волгоград', 'краснодар'
    ]
    
    # Технологии для распознавания
    TECH_KEYWORDS = [
        'python', 'java', 'javascript', 'js', 'typescript', 'ts', 'go', 'golang',
        'rust', 'c++', 'c#', 'php', 'ruby', 'swift', 'kotlin',
        'react', 'vue', 'angular', 'node', 'nodejs', 'express',
        'django', 'flask', 'spring', 'laravel', 'rails',
        'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
        'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp',
        'tensorflow', 'pytorch', 'llm', 'ai', 'machine learning', 'ml',
        'data science', 'big data', 'hadoop', 'spark'
    ]
    
    def process(self, query: str) -> Dict[str, Any]:
        """
        Обработка запроса и извлечение фильтров
        """
        query_lower = query.lower()
        filters = {
            'original_query': query,
            'skills': [],
            'experience': None,
            'city': None,
            'experience_years': None
        }
        
        # Извлечение города
        for city in self.CITIES:
            if city in query_lower:
                filters['city'] = city
                break
        
        # Извлечение опыта
        filters.update(self._extract_experience(query_lower))
        
        # Извлечение навыков
        skills = self._extract_skills(query_lower)
        if skills:
            filters['skills'] = skills
        
        # Формирование поискового запроса для hh.ru
        search_query = self._build_search_query(filters)
        filters['search_query'] = search_query
        
        return filters
    
    def _extract_experience(self, query: str) -> Dict[str, Any]:
        """
        Извлечение требований к опыту
        """
        result = {'experience': None, 'experience_years': None}
        
        # Проверяем паттерны
        for pattern, exp_type in self.EXPERIENCE_PATTERNS.items():
            match = re.search(pattern, query)
            if match:
                if exp_type == 'noExperience':
                    result['experience'] = 'noExperience'
                    result['experience_years'] = 0
                elif exp_type == 'between':
                    min_exp = int(match.group(1))
                    max_exp = int(match.group(2))
                    result['experience'] = self._map_experience_range(min_exp, max_exp)
                    result['experience_years'] = (min_exp + max_exp) / 2
                elif exp_type == 'moreThan':
                    years = int(match.group(1) or match.group(2))
                    result['experience'] = self._map_experience_more_than(years)
                    result['experience_years'] = years
                elif exp_type == 'range':
                    years = int(match.group(1))
                    result['experience'] = self._map_experience_years(years)
                    result['experience_years'] = years
                break
        
        return result
    
    def _extract_skills(self, query: str) -> List[str]:
        """
        Извлечение навыков из запроса
        """
        skills = []
        words = query.split()
        
        i = 0
        while i < len(words):
            # Проверяем двухсловные навыки
            if i < len(words) - 1:
                two_words = f"{words[i]} {words[i+1]}"
                if two_words in self.TECH_KEYWORDS:
                    skills.append(two_words)
                    i += 2
                    continue
            
            # Проверяем однословные навыки
            if words[i] in self.TECH_KEYWORDS:
                skills.append(words[i])
            i += 1
        
        return list(set(skills))
    
    def _map_experience_range(self, min_years: int, max_years: int) -> str:
        """
        Преобразование диапазона лет в тип опыта hh.ru
        """
        if max_years <= 1:
            return 'between1And3'
        elif max_years <= 3:
            return 'between1And3'
        elif max_years <= 6:
            return 'between3And6'
        else:
            return 'moreThan6'
    
    def _map_experience_more_than(self, years: int) -> str:
        """
        Преобразование "более X лет" в тип опыта hh.ru
        """
        if years < 1:
            return 'noExperience'
        elif years < 3:
            return 'between1And3'
        elif years < 6:
            return 'between3And6'
        else:
            return 'moreThan6'
    
    def _map_experience_years(self, years: int) -> str:
        """
        Преобразование конкретного числа лет в тип опыта hh.ru
        """
        if years == 0:
            return 'noExperience'
        elif years <= 3:
            return 'between1And3'
        elif years <= 6:
            return 'between3And6'
        else:
            return 'moreThan6'
    
    def _build_search_query(self, filters: Dict[str, Any]) -> str:
        """
        Формирование поискового запроса для hh.ru
        """
        parts = []
        
        # Добавляем исходный запрос
        parts.append(filters['original_query'])
        
        # Добавляем город
        if filters.get('city'):
            parts.append(filters['city'])
        
        # Добавляем ключевые навыки для лучшего поиска
        if filters.get('skills'):
            skills_str = ' '.join(filters['skills'][:3])  # Ограничиваем 3 навыками
            parts.append(skills_str)
        
        return ' '.join(parts)

    def get_mock_filters(self, query: str) -> Dict[str, Any]:
        """
        Получение тестовых фильтров (для разработки)
        """
        return {
            'original_query': query,
            'skills': ['python', 'docker'],
            'experience': 'between3And6',
            'city': 'москва',
            'experience_years': 4,
            'search_query': f"{query} москва python docker"
        }