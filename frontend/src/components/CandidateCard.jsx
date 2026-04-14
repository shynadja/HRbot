import React, { useState } from 'react'
import { 
  CheckCircle, 
  AlertCircle, 
  ThumbsUp, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  Briefcase,
  MapPin,
  Award,
  ExternalLink,
  XCircle
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './CandidateCard.css'

let activeCardId = null

const CandidateCard = ({ candidate }) => {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(false)
  const cardId = candidate.id

  // Унифицированная функция определения класса вероятности ИИ
  const getAiProbabilityClass = (probability) => {
    if (probability > 70) return 'critical'
    if (probability > 40) return 'high'
    if (probability > 15) return 'medium'
    return 'low'
  }

  // Унифицированная функция получения текста статуса
  const getAiStatusText = (probability) => {
    if (probability > 70) return 'Очень высокая'
    if (probability > 40) return 'Высокая'
    if (probability > 15) return 'Средняя'
    return 'Низкая'
  }

  // Функция для получения иконки статуса
  const getStatusIcon = (probability) => {
    if (probability > 70) return <XCircle size={16} className="status-icon critical" />
    if (probability > 40) return <AlertCircle size={16} className="status-icon high" />
    if (probability > 15) return <AlertCircle size={16} className="status-icon medium" />
    return <CheckCircle size={16} className="status-icon low" />
  }

  // Переход на страницу создания встречи
  const handleScheduleCall = (e) => {
    e.stopPropagation()
    
    // Проверяем настройки календаря
    const settings = JSON.parse(localStorage.getItem('talkpro_settings') || '{}')
    const connectedServices = settings.connectedServices || {}
    
    if (!connectedServices.yandex) {
      if (window.confirm('У вас не подключен Яндекс.Календарь. Хотите перейти в настройки для подключения?')) {
        navigate('/settings')
        return
      }
    }
    
    // Передаем данные кандидата на страницу создания встречи
    navigate('/schedule-meeting', {
      state: {
        candidate: {
          id: candidate.resume_id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          fullName: `${candidate.firstName} ${candidate.lastName}`,
          position: candidate.position,
          experience: candidate.experience,
          email: candidate.email || '',
          phone: candidate.phone || '',
          score: candidate.score
        }
      }
    })
  }

  const handleToggleExpand = (e) => {
    e.stopPropagation()
    
    if (activeCardId && activeCardId !== cardId) {
      const event = new CustomEvent('closeOtherCard', { detail: { excludeId: cardId } })
      window.dispatchEvent(event)
    }
    
    setIsExpanded(!isExpanded)
    activeCardId = !isExpanded ? cardId : null
  }

  React.useEffect(() => {
    const handleCloseOther = (e) => {
      if (e.detail.excludeId !== cardId) {
        setIsExpanded(false)
        if (activeCardId === cardId) {
          activeCardId = null
        }
      }
    }
    
    window.addEventListener('closeOtherCard', handleCloseOther)
    
    return () => {
      window.removeEventListener('closeOtherCard', handleCloseOther)
    }
  }, [cardId])

  const getStrengths = () => {
    if (candidate.strengths && candidate.strengths.length > 0) {
      return candidate.strengths.slice(0, 3)
    }
    if (candidate.strengthsList && candidate.strengthsList.length > 0) {
      return candidate.strengthsList.slice(0, 3)
    }
    return [
      'Опыт работы с современными фреймворками',
      'Хорошее знание TypeScript',
      'Навыки командной работы'
    ]
  }

  const getImprovements = () => {
    if (candidate.improvements && candidate.improvements.length > 0) {
      return candidate.improvements.slice(0, 2)
    }
    if (candidate.improvementsList && candidate.improvementsList.length > 0) {
      return candidate.improvementsList.slice(0, 2)
    }
    return [
      'Не хватает опыта работы с GraphQL',
      'Рекомендуется добавить пет-проекты'
    ]
  }

  const strengths = getStrengths()
  const improvements = getImprovements()
  const aiProbability = candidate.aiProbability || 0
  const aiClass = getAiProbabilityClass(aiProbability)

  return (
    <div className={`candidate-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="candidate-header">
        <div className="candidate-initials">
          {candidate.firstName?.[0] || ''}{candidate.lastName?.[0] || ''}
        </div>
        <div className="candidate-name-info">
          <div className="candidate-fullname">
            {candidate.firstName} {candidate.lastName}
          </div>
          <div className="candidate-position">
            {candidate.position}
          </div>
        </div>
        
        {/* Оценка резюме */}
        <div className="candidate-score">
          <span className="score-value-header">{candidate.score || 85}</span>
          <span className="score-max">/100</span>
        </div>
      </div>
      
      <div className="candidate-details">
        <div className="detail-item">
          <Briefcase size={16} className="detail-icon" />
          <span className="detail-text">
            <span className="detail-label">Опыт работы:</span> {candidate.experience || 'Опыт не указан'}
          </span>
        </div>
        
        <div className="detail-item">
          <Award size={16} className="detail-icon" />
          <span className="detail-text">
            <span className="detail-label">Желаемая должность:</span> {candidate.position}
          </span>
        </div>

        {candidate.location && (
          <div className="detail-item">
            <MapPin size={16} className="detail-icon" />
            <span className="detail-text">
              <span className="detail-label">Локация:</span> {candidate.location}
            </span>
          </div>
        )}
      </div>
      
      <div className="candidate-skills-wrapper">
        <div className="candidate-skills">
          {candidate.skills && candidate.skills.slice(0, 5).map((skill, index) => (
            <span key={index} className="skill-tag">{skill}</span>
          ))}
          {candidate.skills && candidate.skills.length > 5 && (
            <span className="skill-tag more">+{candidate.skills.length - 5}</span>
          )}
        </div>
        
        <button 
          className={`details-btn ${isExpanded ? 'expanded' : ''}`}
          onClick={handleToggleExpand}
        >
          <span>{isExpanded ? 'Скрыть' : 'Подробнее'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Компактный AI-анализ */}
      <div className="ai-probability-block compact-block">
        <div className="probability-header">
          <span className="probability-label">Вероятность ИИ</span>
          <span className={`probability-value ${aiClass}`}>
            {aiProbability}%
          </span>
        </div>
        <div className="probability-bar">
          <div 
            className={`probability-fill ${aiClass}`}
            style={{ width: `${aiProbability}%` }}
          />
        </div>
        <div className="probability-status">
          {getStatusIcon(aiProbability)}
          <span className={`status-text ${aiClass}`}>
            {getAiStatusText(aiProbability)}
          </span>
        </div>
      </div>

      {/* Разворачивающийся блок */}
      {isExpanded && (
        <div className="expandable-details">
          <button 
            className="expandable-call-btn-mobile"
            onClick={handleScheduleCall}
          >
            <Calendar size={18} />
            <span>Запланировать звонок</span>
            <ExternalLink size={14} className="external-icon" />
          </button>

          {/* Подозрительные фразы */}
          {candidate.suspiciousPhrases && candidate.suspiciousPhrases.length > 0 && (
            <div className="suspicious-phrases-block red-border">
              <div className="phrases-header red-text">
                <AlertCircle size={18} className="warning-icon red-icon" />
                <span>Подозрительные фразы:</span>
              </div>
              <ul className="phrases-list red-text">
                {candidate.suspiciousPhrases.slice(0, 5).map((phrase, idx) => (
                  <li key={idx}>
                    <span className="phrase-quote red-text">«</span>
                    {phrase}
                    <span className="phrase-quote red-text">»</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Сильные стороны */}
          <div className="expandable-section">
            <h4 className="expandable-section-title strengths-title">
              <ThumbsUp size={16} />
              Сильные стороны
            </h4>
            <ul className="strengths-list">
              {strengths.map((item, index) => (
                <li key={index} className="strength-item">
                  <CheckCircle size={14} className="strength-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Что улучшить */}
          <div className="expandable-section">
            <h4 className="expandable-section-title improvements-title">
              <TrendingUp size={16} />
              Что улучшить
            </h4>
            <ul className="improvements-list">
              {improvements.map((item, index) => (
                <li key={index} className="improvement-item">
                  <AlertCircle size={14} className="improvement-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <button 
            className="expandable-call-btn-desktop"
            onClick={handleScheduleCall}
          >
            <Calendar size={18} />
            <span>Запланировать звонок</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default CandidateCard