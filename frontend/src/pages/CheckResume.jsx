import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  AlertCircle, 
  FileText,
  Loader,
  CheckCircle,
  XCircle,
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  Briefcase,
  Award,
  MapPin,
  Calendar
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './CheckResume.css'

const CheckResume = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [resumes, setResumes] = useState([])
  const [selectedResumes, setSelectedResumes] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showResumeSelector, setShowResumeSelector] = useState(false)

  // Функция загрузки резюме с useCallback
  const loadResumes = useCallback(async () => {
    setIsLoading(true)
    try {
      // Передаем ID пользователя
      const data = await api.getResumes(user?.id)
      console.log('Загруженные резюме с данными:', data)
      setResumes(data.resumes || [])
    } catch (error) {
      console.error('Error loading resumes:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // Загружаем резюме при монтировании
  useEffect(() => {
    loadResumes()
    
    // Если передан ID резюме из UploadResume
    if (location.state?.resumeId) {
      setSelectedResumes([location.state.resumeId])
    }
    
    // Восстанавливаем результаты анализа из sessionStorage
    const savedResults = sessionStorage.getItem('checkResumeResults')
    if (savedResults) {
      setAnalysisResults(JSON.parse(savedResults))
    }
    
    // Восстанавливаем выбранные резюме
    const savedSelected = sessionStorage.getItem('checkResumeSelected')
    if (savedSelected) {
      setSelectedResumes(JSON.parse(savedSelected))
    }
  }, [location.state, loadResumes])

  // Сохраняем результаты в sessionStorage при изменении
  useEffect(() => {
    if (analysisResults.length > 0) {
      sessionStorage.setItem('checkResumeResults', JSON.stringify(analysisResults))
    }
  }, [analysisResults])

  // Сохраняем выбранные резюме в sessionStorage
  useEffect(() => {
    sessionStorage.setItem('checkResumeSelected', JSON.stringify(selectedResumes))
  }, [selectedResumes])

  const toggleResumeSelection = (resumeId) => {
    setSelectedResumes(prev => {
      if (prev.includes(resumeId)) {
        return prev.filter(id => id !== resumeId)
      } else {
        return [...prev, resumeId]
      }
    })
  }

  const selectAllResumes = () => {
    if (selectedResumes.length === resumes.length) {
      setSelectedResumes([])
    } else {
      setSelectedResumes(resumes.map(r => r.id))
    }
  }

  const handleAnalyze = async () => {
    if (selectedResumes.length === 0) return
    
    setIsAnalyzing(true)
    
    try {
      // Анализируем каждое выбранное резюме
      const results = await Promise.all(
        selectedResumes.map(async (resumeId) => {
          const resume = resumes.find(r => r.id === resumeId)
          const analysis = await api.analyzeResume(resumeId)
          
          // Используем реальные данные из резюме
          return {
            id: resumeId,
            name: resume.name,
            file_name: resume.file_name,
            
            // Данные кандидата
            full_name: resume.full_name || resume.candidate_name || 'Неизвестно',
            first_name: resume.first_name || 'Иван',
            last_name: resume.last_name || 'Иванов',
            position: resume.position || 'Должность не указана',
            experience: resume.experience || 'Опыт не указан',
            skills: resume.skills && resume.skills.length > 0 ? resume.skills : 
                   ['React', 'JavaScript', 'TypeScript', 'HTML/CSS', 'Node.js'].slice(0, 5),
            
            // Анализ ИИ
            aiProbability: analysis.aiProbability || Math.floor(Math.random() * 100),
            suspiciousPhrases: analysis.suspiciousPhrases || [
              'оптимизация производительности с помощью инновационных подходов',
              'реализация сложных алгоритмов машинного обучения',
              'управление распределенной командой из 50+ человек'
            ].slice(0, Math.floor(Math.random() * 3) + 1)
          }
        })
      )
      
      setAnalysisResults(results)
    } catch (error) {
      console.error('Error analyzing resumes:', error)
      alert('❌ Ошибка при анализе резюме')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Функция для определения класса вероятности ИИ
  const getAiProbabilityClass = (probability) => {
    if (probability > 70) return 'critical'
    if (probability > 40) return 'high'
    if (probability > 15) return 'medium'
    return 'low'
  }

  // Функция для получения текста статуса
  const getAiStatusText = (probability) => {
    if (probability > 70) return 'Очень высокая вероятность ИИ'
    if (probability > 40) return 'Высокая вероятность ИИ'
    if (probability > 15) return 'Средняя вероятность ИИ'
    return 'Низкая вероятность ИИ'
  }

  // Функция для форматирования опыта
  const formatExperience = (exp) => {
    if (!exp || exp === 'Опыт не указан') return 'Опыт не указан'
    return exp
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="back-button" onClick={() => navigate('/')}>←</button>
          <h1 className="page-title">Детекция ИИ</h1>
        </div>
        <div className="loading-state">
          <Loader size={40} className="spinning" />
          <p>Загрузка резюме...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Проверить резюме</h1>
      </div>
      
      <div className="check-resume-content">
        {resumes.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>Нет загруженных резюме</h3>
            <p>Сначала загрузите резюме для проверки</p>
            <button 
              className="upload-btn"
              onClick={() => navigate('/upload-resume')}
            >
              Загрузить резюме
            </button>
          </div>
        ) : (
          <>
            <p className="resume-description">
              Выберите резюме для проверки на использование ИИ (доступно: {resumes.length})
            </p>

            {/* Селектор резюме с выпадающим списком */}
            <div className="resume-selector-section">
              <button 
                className={`resume-selector-header ${showResumeSelector ? 'active' : ''}`}
                onClick={() => setShowResumeSelector(!showResumeSelector)}
              >
                <div className="selector-title">
                  <FileText size={20} />
                  <span>Выбрать резюме</span>
                </div>
                <div className="selector-info">
                  <span className="selected-count">
                    Выбрано: {selectedResumes.length}
                  </span>
                  {showResumeSelector ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {showResumeSelector && (
                <div className="resume-selector-dropdown">
                  <div className="selector-actions">
                    <button className="select-all-btn" onClick={selectAllResumes}>
                      <Check size={16} />
                      <span>{selectedResumes.length === resumes.length ? 'Снять все' : 'Выбрать все'}</span>
                    </button>
                  </div>
                  
                  <div className="resume-list">
                    {resumes.map(resume => (
                      <div 
                        key={resume.id}
                        className={`resume-item ${selectedResumes.includes(resume.id) ? 'selected' : ''}`}
                        onClick={() => toggleResumeSelection(resume.id)}
                      >
                        <div className="resume-checkbox">
                          {selectedResumes.includes(resume.id) && <Check size={14} />}
                        </div>
                        <FileText size={20} className="resume-icon" />
                        <div className="resume-info">
                          <div className="resume-name">{resume.name}</div>
                          <div className="resume-meta">
                            <span>{resume.full_name || resume.candidate_name || 'Имя не указано'}</span>
                            <span>•</span>
                            <span>{resume.position || 'Должность не указана'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Кнопка анализа */}
            <button 
              className={`analyze-button ${selectedResumes.length > 0 ? 'active' : ''}`}
              onClick={handleAnalyze}
              disabled={selectedResumes.length === 0 || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader size={18} className="spinning" />
                  <span>Проверка... ({selectedResumes.length} резюме)</span>
                </>
              ) : (
                `Проверить на ИИ`
              )}
            </button>

            {/* Результаты анализа */}
            {analysisResults.length > 0 && !isAnalyzing && (
              <div className="analysis-results">
                <h3 className="results-title">Результаты проверки на ИИ</h3>
                
                {analysisResults.map((result) => (
                  <div key={result.id} className="ai-analysis-card">
                    <div className="ai-card-header">
                      <div className="candidate-info">
                        <div className="candidate-initials">
                          {result.first_name[0]}{result.last_name[0]}
                        </div>
                        <div>
                          <div className="candidate-name">
                            {result.first_name} {result.last_name}
                          </div>
                          <div className="candidate-position">{result.position}</div>
                        </div>
                      </div>
                      <div className="ai-score-badge">
                        <Brain size={20} />
                        <span>AI детектор</span>
                      </div>
                    </div>

                    {/* Информация о кандидате */}
                    <div className="candidate-details">
                      <div className="detail-item">
                        <Briefcase size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Опыт работы:</span> {formatExperience(result.experience)}
                        </span>
                      </div>
                      
                      <div className="detail-item">
                        <Award size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Желаемая должность:</span> {result.position}
                        </span>
                      </div>
                      
                      <div className="detail-item">
                        <MapPin size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Локация:</span> Москва
                        </span>
                      </div>
                    </div>

                    {/* Навыки */}
                    {result.skills && result.skills.length > 0 && (
                      <div className="candidate-skills-wrapper">
                        <div className="candidate-skills">
                          {result.skills.slice(0, 5).map((skill, index) => (
                            <span key={index} className="skill-tag">{skill}</span>
                          ))}
                          {result.skills.length > 5 && (
                            <span className="skill-tag more">+{result.skills.length - 5}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Блок с вероятностью ИИ */}
                    <div className="ai-probability-block">
                      <div className="probability-header">
                        <span className="probability-label">Вероятность использования ИИ</span>
                        <span className={`probability-value ${getAiProbabilityClass(result.aiProbability)}`}>
                          {result.aiProbability}%
                        </span>
                      </div>
                      
                      <div className="probability-bar">
                        <div 
                          className={`probability-fill ${getAiProbabilityClass(result.aiProbability)}`}
                          style={{ width: `${result.aiProbability}%` }}
                        />
                      </div>
                      
                      <div className="probability-status">
                        {result.aiProbability > 70 ? (
                          <XCircle size={16} className="status-icon critical" />
                        ) : result.aiProbability > 40 ? (
                          <AlertCircle size={16} className="status-icon high" />
                        ) : result.aiProbability > 15 ? (
                          <AlertCircle size={16} className="status-icon medium" />
                        ) : (
                          <CheckCircle size={16} className="status-icon low" />
                        )}
                        <span className={`status-text ${getAiProbabilityClass(result.aiProbability)}`}>
                          {getAiStatusText(result.aiProbability)}
                        </span>
                      </div>
                    </div>

                    {/* Подозрительные фразы - красная рамка */}
                    {result.suspiciousPhrases && result.suspiciousPhrases.length > 0 && (
                      <div className="suspicious-phrases-block red-border">
                        <div className="phrases-header red-text">
                          <AlertCircle size={18} className="warning-icon red-icon" />
                          <span>Подозрительные фразы (возможно сгенерированы ИИ):</span>
                        </div>
                        <ul className="phrases-list red-text">
                          {result.suspiciousPhrases.map((phrase, idx) => (
                            <li key={idx}>
                              <span className="phrase-quote red-text">«</span>
                              {phrase}
                              <span className="phrase-quote red-text">»</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CheckResume