"""
Сервис для работы с кандидатами и анализа резюме
"""
import hashlib
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_

from database.models import (
    User, Candidate, Resume, CandidateAnalysis
)
from agents.single_agent import SingleAgent
from gigachat.gigachat_client import GigaChatClient
from gigachat.prompts import ANALYSIS_PROMPTS

logger = logging.getLogger(__name__)


class CandidateService:
    """Сервис для управления кандидатами и анализа резюме"""
    
    def __init__(
        self,
        db: Session,
        gigachat_client: GigaChatClient,
        cache_manager=None,
        efficiency_analyzer=None
    ):
        self.db = db
        self.gigachat_client = gigachat_client
        self.cache_manager = cache_manager
        self.efficiency_analyzer = efficiency_analyzer
    
    @staticmethod
    def hash_personal_data(data: str) -> str:
        """Хэширование персональных данных"""
        if not data:
            return None
        return hashlib.sha256(data.lower().strip().encode()).hexdigest()
    
    def create_candidate_from_resume(
        self,
        user_id: int,
        file_name: str,
        file_path: str,
        file_size: int,
        file_type: str,
        parsed_data: Dict[str, Any],
        resume_text: str
    ) -> Tuple[Candidate, Resume]:
        """
        Создание кандидата и записи о резюме
        """
        # Хэшируем персональные данные
        name_hash = self.hash_personal_data(
            f"{parsed_data.get('first_name', '')} {parsed_data.get('last_name', '')}"
        )
        email_hash = self.hash_personal_data(parsed_data.get('email'))
        phone_hash = self.hash_personal_data(parsed_data.get('phone'))
        
        # Проверяем существование кандидата по хэшам
        existing_candidate = None
        if name_hash or email_hash or phone_hash:
            query = self.db.query(Candidate)
            if name_hash:
                query = query.filter(Candidate.name_hash == name_hash)
            if email_hash:
                query = query.filter(Candidate.email_hash == email_hash)
            existing_candidate = query.first()
        
        if existing_candidate:
            # Обновляем существующего кандидата
            candidate = existing_candidate
            candidate.position = parsed_data.get('position', candidate.position)
            candidate.experience_text = parsed_data.get('experience', candidate.experience_text)
            candidate.skills = parsed_data.get('skills', candidate.skills)
            candidate.hard_skills = parsed_data.get('hard_skills', candidate.hard_skills)
            candidate.soft_skills = parsed_data.get('soft_skills', candidate.soft_skills)
            candidate.education = parsed_data.get('education', candidate.education)
            candidate.location = parsed_data.get('location', candidate.location)
            candidate.salary_min = parsed_data.get('salary_min', candidate.salary_min)
            candidate.salary_max = parsed_data.get('salary_max', candidate.salary_max)
            candidate.resume_text = resume_text
            candidate.updated_at = datetime.utcnow()
        else:
            # Создаем нового кандидата
            candidate = Candidate(
                uuid=str(uuid.uuid4()),
                name_hash=name_hash,
                email_hash=email_hash,
                phone_hash=phone_hash,
                position=parsed_data.get('position'),
                experience_text=parsed_data.get('experience'),
                skills=parsed_data.get('skills', []),
                hard_skills=parsed_data.get('hard_skills'),
                soft_skills=parsed_data.get('soft_skills'),
                education=parsed_data.get('education'),
                location=parsed_data.get('location'),
                salary_min=parsed_data.get('salary_min'),
                salary_max=parsed_data.get('salary_max'),
                resume_text=resume_text,
                resume_file_name=file_name
            )
            self.db.add(candidate)
        
        self.db.flush()
        
        # Создаем запись о резюме
        resume = Resume(
            uuid=str(uuid.uuid4()),
            user_id=user_id,
            candidate_id=candidate.id,
            file_name=file_name,
            file_path=file_path,
            file_size=file_size,
            file_type=file_type,
            is_active=True
        )
        self.db.add(resume)
        
        self.db.commit()
        self.db.refresh(candidate)
        self.db.refresh(resume)
        
        return candidate, resume
    
    def get_user_resumes(
        self,
        user_id: int,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """Получение списка резюме пользователя"""
        query = self.db.query(Resume).filter(Resume.user_id == user_id)
        
        if not include_inactive:
            query = query.filter(Resume.is_active == True)
        
        resumes = query.order_by(Resume.created_at.desc()).all()
        
        result = []
        for resume in resumes:
            resume_dict = resume.to_dict(include_candidate=True)
            
            # Добавляем персональные данные из кэша клиента (если есть)
            resume_dict['candidate_name'] = None  # Будет заполнено из кэша клиента
            resume_dict['candidate_uuid'] = resume.candidate.uuid if resume.candidate else None
            
            result.append(resume_dict)
        
        return result
    
    def get_candidate_for_display(
        self,
        candidate_uuid: str,
        personal_data_cache: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Получение данных кандидата для отображения
        Персональные данные берутся из кэша клиента
        """
        candidate = self.db.query(Candidate).filter(
            Candidate.uuid == candidate_uuid
        ).first()
        
        if not candidate:
            return {}
        
        result = candidate.to_dict()
        
        # Персональные данные из кэша (по UUID кандидата)
        if personal_data_cache and candidate_uuid in personal_data_cache:
            cached = personal_data_cache[candidate_uuid]
            result['first_name'] = cached.get('first_name', '')
            result['last_name'] = cached.get('last_name', '')
            result['full_name'] = cached.get('full_name', '')
            result['email'] = cached.get('email', '')
            result['phone'] = cached.get('phone', '')
        
        return result
    
    def analyze_candidate_with_single_agent(
        self,
        candidate_uuid: str,
        vacancy_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Анализ кандидата с помощью Single Agent
        """
        candidate = self.db.query(Candidate).filter(
            Candidate.uuid == candidate_uuid
        ).first()
        
        if not candidate:
            raise ValueError(f"Candidate not found: {candidate_uuid}")
        
        # Подготавливаем данные для агента
        agent_data = {
            "idCv": candidate.uuid,
            "idVacancy": vacancy_data.get("id", "unknown"),
            "positionName": candidate.position or "",
            "experience": candidate.experience_years or 0,
            "education": candidate.education or "",
            "hardSkills_cv": candidate.hard_skills or "",
            "softSkills_cv": candidate.soft_skills or "",
            "salaryMin_cv": candidate.salary_min,
            "salaryMax_cv": candidate.salary_max,
            "localityName": candidate.location or "",
            "vacancyName": vacancy_data.get("name", ""),
            "company": vacancy_data.get("company", ""),
            "experienceRequirements": vacancy_data.get("experience_requirements", ""),
            "hardSkills_vacancy": vacancy_data.get("hard_skills", ""),
            "softSkills_vacancy": vacancy_data.get("soft_skills", ""),
            "responsibilities": vacancy_data.get("responsibilities", ""),
            "positionRequirements": vacancy_data.get("requirements", ""),
            "salaryMin_vacancy": vacancy_data.get("salary_min"),
            "salaryMax_vacancy": vacancy_data.get("salary_max"),
        }
        
        # Создаем и запускаем агента
        agent = SingleAgent(
            api_client=self.gigachat_client,
            cache_manager=self.cache_manager,
            use_cache=True,
            efficiency_analyzer=self.efficiency_analyzer
        )
        
        result, token_usage = agent.process(agent_data)
        
        # Сохраняем результаты анализа
        analysis = CandidateAnalysis(
            candidate_id=candidate.id,
            vacancy_id=vacancy_data.get("id"),
            quick_assessment_score=result.get('quick_assessment', {}).get('score'),
            strengths=result.get('strengths', []),
            improvements=result.get('improvements', []),
            final_verdict=result.get('final_verdict', {}).get('decision'),
            verdict_reason=result.get('final_verdict', {}).get('reason'),
            processing_time=result.get('processing_time'),
            tokens_used=token_usage.get('total_tokens', 0)
        )
        self.db.add(analysis)
        self.db.commit()
        
        # Добавляем ID анализа в результат
        result['analysis_id'] = analysis.id
        result['candidate_uuid'] = candidate.uuid
        
        return result
    
    def analyze_ai_detection(
        self,
        candidate_uuid: str
    ) -> Dict[str, Any]:
        """
        Анализ резюме на использование ИИ
        """
        candidate = self.db.query(Candidate).filter(
            Candidate.uuid == candidate_uuid
        ).first()
        
        if not candidate or not candidate.resume_text:
            raise ValueError(f"Candidate not found or no resume text: {candidate_uuid}")
        
        resume_text = candidate.resume_text[:5000]  # Ограничение длины
        
        # Детекция ИИ
        ai_prompt = ANALYSIS_PROMPTS["check_ai_generated"].format(text=resume_text)
        ai_result, ai_tokens = self.gigachat_client.analyze(
            ai_prompt, temperature=0.1, max_tokens=100
        )
        
        ai_content = ai_result["choices"][0]["message"]["content"]
        import re
        numbers = re.findall(r'\b\d{1,3}\b', ai_content)
        ai_probability = int(numbers[0]) if numbers else 50
        
        # Поиск преувеличений
        ex_prompt = ANALYSIS_PROMPTS["find_exaggerations"].format(text=resume_text)
        ex_result, ex_tokens = self.gigachat_client.analyze(
            ex_prompt, temperature=0.1, max_tokens=500
        )
        
        ex_content = ex_result["choices"][0]["message"]["content"]
        
        # Извлекаем JSON с преувеличениями
        import json
        json_match = re.search(r'```json\n(.*?)\n```', ex_content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            start = ex_content.find('[')
            end = ex_content.rfind(']') + 1
            if start != -1 and end > start:
                json_str = ex_content[start:end]
            else:
                json_str = "[]"
        
        try:
            exaggerations = json.loads(json_str)
        except:
            exaggerations = []
        
        # Сохраняем или обновляем анализ
        existing_analysis = self.db.query(CandidateAnalysis).filter(
            CandidateAnalysis.candidate_id == candidate.id
        ).order_by(CandidateAnalysis.created_at.desc()).first()
        
        if existing_analysis:
            existing_analysis.ai_probability = ai_probability
            existing_analysis.exaggerations = exaggerations
            existing_analysis.suspicious_phrases = [
                ex.get('fragment', '') for ex in exaggerations[:3]
            ]
            existing_analysis.tokens_used = (
                (existing_analysis.tokens_used or 0) + 
                ai_tokens.get('total_tokens', 0) + 
                ex_tokens.get('total_tokens', 0)
            )
        else:
            analysis = CandidateAnalysis(
                candidate_id=candidate.id,
                ai_probability=ai_probability,
                exaggerations=exaggerations,
                suspicious_phrases=[ex.get('fragment', '') for ex in exaggerations[:3]],
                tokens_used=ai_tokens.get('total_tokens', 0) + ex_tokens.get('total_tokens', 0)
            )
            self.db.add(analysis)
        
        self.db.commit()
        
        return {
            "candidate_uuid": candidate.uuid,
            "ai_probability": min(100, max(0, ai_probability)),
            "exaggerations": exaggerations,
            "exaggerations_count": len(exaggerations),
            "suspicious_phrases": [ex.get('fragment', '') for ex in exaggerations[:3]]
        }
    
    def search_candidates(
        self,
        user_id: int,
        resume_ids: List[int],
        search_query: str,
        personal_data_cache: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Поиск кандидатов по выбранным резюме с анализом через Single Agent
        """
        # Получаем выбранные резюме
        resumes = self.db.query(Resume).filter(
            and_(
                Resume.user_id == user_id,
                Resume.id.in_(resume_ids),
                Resume.is_active == True
            )
        ).all()
        
        if not resumes:
            return []
        
        # Парсим поисковый запрос для создания "виртуальной вакансии"
        vacancy_data = {
            "id": f"search_{user_id}_{datetime.utcnow().timestamp()}",
            "name": search_query[:100],
            "requirements": search_query,
            "hard_skills": self._extract_skills_from_query(search_query),
        }
        
        results = []
        for resume in resumes:
            candidate = resume.candidate
            
            # Анализируем кандидата
            try:
                analysis_result = self.analyze_candidate_with_single_agent(
                    candidate.uuid,
                    vacancy_data
                )
                
                # Формируем результат для отображения
                candidate_data = self.get_candidate_for_display(
                    candidate.uuid,
                    personal_data_cache
                )
                
                result = {
                    "id": resume.id,
                    "resume_id": resume.id,
                    "candidate_uuid": candidate.uuid,
                    "score": analysis_result.get('quick_assessment', {}).get('score', 50),
                    "verdict": analysis_result.get('final_verdict', {}).get('decision', 'Отказ'),
                    "verdict_reason": analysis_result.get('final_verdict', {}).get('reason', ''),
                    "strengths": analysis_result.get('strengths', []),
                    "improvements": analysis_result.get('improvements', []),
                    # Персональные данные из кэша
                    "first_name": candidate_data.get('first_name', ''),
                    "last_name": candidate_data.get('last_name', ''),
                    "full_name": candidate_data.get('full_name', ''),
                    # Данные из резюме
                    "position": candidate.position,
                    "experience": candidate.experience_text,
                    "skills": candidate.skills or [],
                    "location": candidate.location,
                    # AI анализ
                    "ai_probability": None,
                }
                
                # Добавляем AI анализ если есть
                latest_analysis = self.db.query(CandidateAnalysis).filter(
                    CandidateAnalysis.candidate_id == candidate.id
                ).order_by(CandidateAnalysis.created_at.desc()).first()
                
                if latest_analysis:
                    result["ai_probability"] = latest_analysis.ai_probability
                    result["suspicious_phrases"] = latest_analysis.suspicious_phrases or []
                
                results.append(result)
                
            except Exception as e:
                logger.error(f"Error analyzing candidate {candidate.uuid}: {e}")
                continue
        
        # Сортируем по score
        results.sort(key=lambda x: x.get('score', 0), reverse=True)
        
        return results
    
    def _extract_skills_from_query(self, query: str) -> str:
        """Извлечение навыков из поискового запроса"""
        common_skills = [
            'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular',
            'Node.js', 'Django', 'Flask', 'FastAPI', 'Spring', 'SQL', 'PostgreSQL',
            'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure',
            'GCP', 'Git', 'CI/CD', 'DevOps', 'Machine Learning', 'AI', 'Data Science'
        ]
        
        found_skills = []
        query_lower = query.lower()
        for skill in common_skills:
            if skill.lower() in query_lower:
                found_skills.append(skill)
        
        return ', '.join(found_skills) if found_skills else query[:200]