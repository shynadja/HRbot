import aiohttp
import asyncio
import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class HHParser:
    def __init__(self):
        self.base_url = settings.HH_API_BASE_URL
        self.headers = {
            'User-Agent': settings.HH_USER_AGENT
        }
    
    async def search_resumes(self, query: str, filters: Dict[str, Any], limit: int = 20) -> List[Dict]:
        """
        Поиск резюме на hh.ru
        """
        try:
            params = {
                'text': query,
                'area': 1,  # Москва (по умолчанию)
                'per_page': min(limit, 20),
                'page': 0
            }
            
            # Добавляем фильтры из распознанного запроса
            if 'experience' in filters and filters['experience']:
                params['experience'] = filters['experience']
            
            if 'city' in filters and filters['city']:
                city_code = await self._get_city_code(filters['city'])
                if city_code:
                    params['area'] = city_code
            
            logger.info(f"Searching resumes with params: {params}")
            
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.get(f"{self.base_url}/resumes", params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        items = data.get('items', [])
                        logger.info(f"Found {len(items)} resumes")
                        return items
                    else:
                        logger.error(f"HH.ru API error: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Error searching resumes: {e}")
            return []
    
    async def get_resume_details(self, resume_id: str) -> Optional[Dict]:
        """
        Получение детальной информации по резюме
        """
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.get(f"{self.base_url}/resumes/{resume_id}") as response:
                    if response.status == 200:
                        data = await response.json()
                        return data
                    else:
                        logger.error(f"Error getting resume {resume_id}: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error getting resume details: {e}")
            return None
    
    async def parse_resume(self, resume_data: Dict) -> Dict:
        """
        Парсинг данных резюме в нашу структуру с ПОЛНЫМ текстом резюме
        """
        try:
            # Основная информация
            first_name = resume_data.get('first_name', '')
            last_name = resume_data.get('last_name', '')
            
            # Должность
            position = resume_data.get('title', '')
            
            # Компания (последнее место работы)
            company = ''
            experience_items = resume_data.get('experience', [])
            if experience_items:
                last_job = experience_items[0]
                company = last_job.get('company', '')
            
            # Опыт работы
            total_experience = resume_data.get('total_experience', {})
            experience_months = total_experience.get('months', 0)
            experience_str = self._format_experience(experience_months)
            
            # Навыки
            skills = resume_data.get('skills', [])
            if not skills and 'skill_set' in resume_data:
                skills = resume_data.get('skill_set', [])
            
            # Контакты
            phone = ''
            email = ''
            contacts = resume_data.get('contact', [])
            for contact in contacts:
                if contact.get('type', {}).get('id') == 'cell':
                    phone = contact.get('value', {}).get('formatted', '')
                elif contact.get('type', {}).get('id') == 'email':
                    email = contact.get('value', '')
            
            # ПОЛНЫЙ ТЕКСТ РЕЗЮМЕ - собираем из всех частей
            full_resume_text = await self._build_complete_resume_text(resume_data)
            
            return {
                'hh_id': resume_data.get('id'),
                'first_name': first_name,
                'last_name': last_name,
                'position': position,
                'company': company,
                'experience': experience_str,
                'experience_months': experience_months,
                'skills': skills,
                'phone': phone,
                'email': email,
                'resume_text': full_resume_text,  # Полный текст резюме
                'resume_url': resume_data.get('alternate_url', ''),
                'last_parsed_at': datetime.utcnow()
            }
        except Exception as e:
            logger.error(f"Error parsing resume: {e}")
            return {}
    
    async def _build_complete_resume_text(self, resume_data: Dict) -> str:
        """
        Формирование ПОЛНОГО текста резюме из всех доступных полей
        Это то, что будет передаваться в Gigachat для анализа
        """
        parts = []
        
        # 1. Заголовок и желаемая должность
        if resume_data.get('title'):
            parts.append(f"Желаемая должность: {resume_data['title']}")
        
        # 2. Специализации
        specializations = resume_data.get('specializations', [])
        if specializations:
            spec_text = ", ".join([s.get('name', '') for s in specializations])
            parts.append(f"Специализация: {spec_text}")
        
        # 3. Зарплата
        salary = resume_data.get('salary')
        if salary:
            salary_str = f"{salary.get('amount', '')} {salary.get('currency', '')}"
            if salary.get('gross'):
                salary_str += " (до вычета налогов)"
            parts.append(f"Желаемая зарплата: {salary_str}")
        
        # 4. Опыт работы (ПОДРОБНО)
        experience = resume_data.get('experience', [])
        if experience:
            parts.append("\n=== ОПЫТ РАБОТЫ ===")
            for job in experience:
                company = job.get('company', '')
                position = job.get('position', '')
                start = job.get('start', '')
                end = job.get('end', 'по настоящее время') if job.get('end') is None else job.get('end', '')
                description = job.get('description', '')
                
                job_header = f"\n• {position} в {company}"
                job_period = f"  Период: {start} - {end}"
                parts.append(job_header)
                parts.append(job_period)
                
                if description:
                    # Очищаем описание от HTML тегов
                    clean_description = self._clean_html(description)
                    parts.append(f"  Обязанности и достижения:\n{clean_description}")
        
        # 5. Образование
        education = resume_data.get('education', {})
        if education:
            parts.append("\n=== ОБРАЗОВАНИЕ ===")
            
            # Высшее образование
            primary = education.get('primary', [])
            for edu in primary:
                name = edu.get('name', '')
                institution = edu.get('institution', '')
                year = edu.get('year', '')
                if name and institution:
                    parts.append(f"• {name}, {institution}, {year}")
            
            # Дополнительное образование
            additional = education.get('additional', [])
            if additional:
                parts.append("\nДополнительное образование:")
                for edu in additional:
                    name = edu.get('name', '')
                    institution = edu.get('institution', '')
                    year = edu.get('year', '')
                    if name:
                        parts.append(f"• {name}, {institution}, {year}")
        
        # 6. Курсы и тренинги
        courses = resume_data.get('courses', [])
        if courses:
            parts.append("\n=== КУРСЫ И ТРЕНИНГИ ===")
            for course in courses:
                name = course.get('name', '')
                institution = course.get('institution', '')
                year = course.get('year', '')
                if name:
                    parts.append(f"• {name}, {institution}, {year}")
        
        # 7. Навыки (ПОДРОБНО)
        skills = resume_data.get('skills', [])
        if skills:
            parts.append("\n=== КЛЮЧЕВЫЕ НАВЫКИ ===")
            parts.append(", ".join(skills))
        
        # 8. Знание языков
        languages = resume_data.get('language', [])
        if languages:
            parts.append("\n=== ЗНАНИЕ ЯЗЫКОВ ===")
            for lang in languages:
                name = lang.get('name', '')
                level = lang.get('level', {}).get('name', '')
                if name:
                    parts.append(f"• {name}: {level}")
        
        # 9. О себе (дополнительная информация)
        about = resume_data.get('about', '')
        if about:
            parts.append("\n=== О СЕБЕ ===")
            clean_about = self._clean_html(about)
            parts.append(clean_about)
        
        # 10. Гражданство и место проживания
        area = resume_data.get('area', {})
        if area:
            city = area.get('name', '')
            if city:
                parts.append(f"\nМесто проживания: {city}")
        
        citizenship = resume_data.get('citizenship', [])
        if citizenship:
            countries = [c.get('name', '') for c in citizenship if c.get('name')]
            if countries:
                parts.append(f"Гражданство: {', '.join(countries)}")
        
        # 11. Занятость и график работы
        employment = resume_data.get('employment', {})
        if employment:
            emp_name = employment.get('name', '')
            if emp_name:
                parts.append(f"Желаемая занятость: {emp_name}")
        
        schedule = resume_data.get('schedule', {})
        if schedule:
            schedule_name = schedule.get('name', '')
            if schedule_name:
                parts.append(f"График работы: {schedule_name}")
        
        # 12. Портфолио (если есть)
        portfolio = resume_data.get('portfolio', [])
        if portfolio:
            parts.append("\n=== ПОРТФОЛИО ===")
            for item in portfolio:
                if item.get('description'):
                    parts.append(f"• {item.get('description', '')}")
        
        # Собираем всё вместе
        full_text = "\n".join(parts)
        
        # Очищаем от лишних пробелов и пустых строк
        full_text = re.sub(r'\n\s*\n', '\n\n', full_text)
        full_text = full_text.strip()
        
        logger.info(f"Built complete resume text, length: {len(full_text)} chars")
        return full_text
    
    def _clean_html(self, text: str) -> str:
        """
        Очистка текста от HTML тегов
        """
        if not text:
            return ""
        # Удаляем HTML теги
        clean = re.sub(r'<[^>]+>', ' ', text)
        # Заменяем множественные пробелы на один
        clean = re.sub(r'\s+', ' ', clean)
        # Заменяем множественные переносы строк
        clean = re.sub(r'\n\s*\n', '\n\n', clean)
        return clean.strip()
    
    async def _get_city_code(self, city_name: str) -> Optional[int]:
        """
        Получение кода региона hh.ru по названию города
        """
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.get(f"{self.base_url}/areas") as response:
                    if response.status == 200:
                        areas = await response.json()
                        return self._find_city_code(areas, city_name.lower())
                    return None
        except Exception as e:
            logger.error(f"Error getting city code: {e}")
            return 1  # Москва по умолчанию
    
    def _find_city_code(self, areas, city_name: str) -> Optional[int]:
        """
        Рекурсивный поиск кода города в дереве регионов
        """
        for area in areas:
            if area.get('name', '').lower() == city_name:
                return area.get('id')
            if 'areas' in area:
                code = self._find_city_code(area['areas'], city_name)
                if code:
                    return code
        return None
    
    def _format_experience(self, months: int) -> str:
        """
        Форматирование опыта в человекочитаемый вид
        """
        years = months // 12
        months = months % 12
        
        parts = []
        if years > 0:
            years_str = f"{years} {self._pluralize(years, 'год', 'года', 'лет')}"
            parts.append(years_str)
        if months > 0:
            months_str = f"{months} {self._pluralize(months, 'месяц', 'месяца', 'месяцев')}"
            parts.append(months_str)
        
        return " ".join(parts) if parts else "Нет опыта"
    
    def _pluralize(self, n: int, form1: str, form2: str, form5: str) -> str:
        """
        Склонение существительных после числительных
        """
        if n % 10 == 1 and n % 100 != 11:
            return form1
        elif 2 <= n % 10 <= 4 and (n % 100 < 10 or n % 100 >= 20):
            return form2
        else:
            return form5

    async def get_mock_resume(self, resume_id: str = "1") -> Dict:
        """
        Получение тестовых данных (для разработки, когда API hh.ru недоступно)
        """
        mock_resume = {
            'id': resume_id,
            'first_name': 'Алексей',
            'last_name': 'Смирнов',
            'title': 'Senior Python Developer',
            'area': {'name': 'Москва'},
            'salary': {'amount': 300000, 'currency': 'RUR'},
            'experience': [
                {
                    'company': 'Яндекс',
                    'position': 'Senior Python Developer',
                    'start': '2020-01',
                    'end': None,
                    'description': 'Разработка высоконагруженных сервисов на Python. Оптимизация производительности, рефакторинг легаси кода. Проектирование архитектуры микросервисов.'
                },
                {
                    'company': 'Тинькофф',
                    'position': 'Python Developer',
                    'start': '2017-03',
                    'end': '2019-12',
                    'description': 'Разработка банковских сервисов. Интеграция с внешними API. Работа с PostgreSQL, RabbitMQ. Участие в code review.'
                }
            ],
            'education': {
                'primary': [
                    {
                        'name': 'Факультет вычислительной математики и кибернетики',
                        'institution': 'МГУ им. М.В. Ломоносова',
                        'year': 2017
                    }
                ]
            },
            'skills': ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Docker', 'Kubernetes', 'Redis', 'RabbitMQ', 'Git', 'Linux'],
            'language': [
                {'name': 'Английский', 'level': {'name': 'B2 - Средне-продвинутый'}}
            ],
            'about': 'Ответственный, коммуникабельный, умею работать в команде. Постоянно изучаю новые технологии. Участвую в open source проектах.',
            'contact': [{'type': {'id': 'cell'}, 'value': {'formatted': '+7 (999) 123-45-67'}}],
            'total_experience': {'months': 78},
            'alternate_url': f'https://hh.ru/resume/{resume_id}',
            'citizenship': [{'name': 'Россия'}],
            'employment': {'name': 'Полная занятость'},
            'schedule': {'name': 'Полный день'}
        }
        return mock_resume