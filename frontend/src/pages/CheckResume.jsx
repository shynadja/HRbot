import React, { useState, useEffect, useMemo } from 'react'
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
  MapPin
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useResumes } from '../hooks/useResumes'
import { useUI } from '../hooks/useUI'
import ResumeCard from '../components/ResumeCard'
import './CheckResume.css'

const CheckResume = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const {
    items: resumes,
    selectedIds: selectedResumes,
    analysisResults,
    isLoading,
    isAnalyzing,
    loadResumes,
    toggleSelection,
    selectAll,
    analyzeMultipleResumes,
    setSelection,
    isSelected
  } = useResumes()
  const { 
    showResumeSelector: { checkResume: showResumeSelector }, 
    toggleSelector,
    showNotification 
  } = useUI()
  
  const [error, setError] = useState(null)

  // Убираем дубликаты резюме по id
  const uniqueResumes = useMemo(() => {
    const seen = new Set()
    return resumes.filter(resume => {
      if (seen.has(resume.id)) {
        return false
      }
      seen.add(resume.id)
      return true
    })
  }, [resumes])

  // Убираем дубликаты результатов анализа по id
  const uniqueAnalysisResults = useMemo(() => {
    const seen = new Set()
    return analysisResults.filter(result => {
      if (seen.has(result.id)) {
        return false
      }
      seen.add(result.id)
      return true
    })
  }, [analysisResults])

  useEffect(() => {
    if (user?.id) {
      loadResumes(user.id)
    }
  }, [loadResumes, user?.id])

  useEffect(() => {
    if (location.state?.resumeId) {
      // Проверяем, не выбран ли уже этот resumeId
      if (!selectedResumes.includes(location.state.resumeId)) {
        setSelection([...selectedResumes, location.state.resumeId])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]) 
  
  const handleAnalyze = async () => {
    if (selectedResumes.length === 0) return
    
    setError(null)
    
    try {
      await analyzeMultipleResumes(selectedResumes)
      showNotification(`Анализ ${selectedResumes.length} резюме завершен`, 'success')
    } catch (err) {
      console.error('Error analyzing resumes:', err)
      setError('Ошибка при анализе резюме')
    }
  }

  const getAiProbabilityClass = (probability) => {
    if (probability > 70) return 'critical'
    if (probability > 40) return 'high'
    if (probability > 15) return 'medium'
    return 'low'
  }

  const getAiStatusText = (probability) => {
    if (probability > 70) return 'Очень высокая'
    if (probability > 40) return 'Высокая'
    if (probability > 15) return 'Средняя'
    return 'Низкая'
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="back-button" onClick={() => navigate('/')}>←</button>
          <h1 className="page-title">Детекция ИИ</h1>
        </div>
        <div className="loading-container">
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
        {uniqueResumes.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>Нет загруженных резюме</h3>
            <p>Сначала загрузите резюме для проверки</p>
            <button className="upload-btn" onClick={() => navigate('/upload-resume')}>
              Загрузить резюме
            </button>
          </div>
        ) : (
          <>
            <p className="resume-description">
              Выберите резюме для проверки на использование ИИ
            </p>

            <div className="resume-selector-section">
              <button 
                className={`resume-selector-header ${showResumeSelector ? 'active' : ''}`}
                onClick={() => toggleSelector('checkResume')}
              >
                <div className="selector-title">
                  <FileText size={20} />
                  <span>Выбрать резюме</span>
                </div>
                <div className="selector-info">
                  <span className="selected-count">Выбрано: {selectedResumes.length}</span>
                  {showResumeSelector ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {showResumeSelector && (
                <div className="resume-selector-dropdown">
                  <div className="selector-actions">
                    <button className="select-all-btn" onClick={selectAll}>
                      <Check size={16} />
                      <span>{selectedResumes.length === uniqueResumes.length ? 'Снять все' : 'Выбрать все'}</span>
                    </button>
                  </div>
                  
                  <div className="resume-list">
                    {uniqueResumes.map(resume => (
                      <ResumeCard
                        key={resume.id}
                        resume={resume}
                        selected={isSelected(resume.id)}
                        onSelect={toggleSelection}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                `Проверить резюме`
              )}
            </button>

            {error && (
              <div className="error-message">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {uniqueAnalysisResults.length > 0 && !isAnalyzing && (
              <div className="analysis-results">
                <h3 className="results-title">Результаты проверки</h3>
                
                {uniqueAnalysisResults.map((result) => (
                  <div key={result.id} className="ai-analysis-card">
                    <div className="ai-card-header">
                      <div className="candidate-info">
                        <div className="candidate-initials">
                          {result.first_name?.[0] || ''}{result.last_name?.[0] || ''}
                        </div>
                        <div>
                          <div className="candidate-name">{result.first_name} {result.last_name}</div>
                          <div className="candidate-position">{result.position}</div>
                        </div>
                      </div>
                      <div className="ai-score-badge">
                        <Brain size={20} />
                        <span>AI детектор</span>
                      </div>
                    </div>

                    <div className="candidate-details">
                      <div className="detail-item">
                        <Briefcase size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Опыт работы:</span> {result.experience}
                        </span>
                      </div>
                      <div className="detail-item">
                        <Award size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Должность:</span> {result.position}
                        </span>
                      </div>
                      <div className="detail-item">
                        <MapPin size={16} className="detail-icon" />
                        <span className="detail-text">
                          <span className="detail-label">Локация:</span> Москва
                        </span>
                      </div>
                    </div>

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

                    <div className="ai-probability-block">
                      <div className="probability-header">
                        <span className="probability-label">Вероятность ИИ</span>
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

                    {result.suspiciousPhrases && result.suspiciousPhrases.length > 0 && (
                      <div className="suspicious-phrases-block red-border">
                        <div className="phrases-header red-text">
                          <AlertCircle size={18} className="warning-icon red-icon" />
                          <span>Подозрительные фразы:</span>
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