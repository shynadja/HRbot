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
  ExternalLink
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './CandidateCard.css'

let activeCardId = null; // Глобальный идентификатор активной карточки

const CandidateCard = ({ candidate }) => {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(false)
  const cardId = candidate.id

  // Функция для открытия календаря
  const openCalendar = (service) => {
    const eventTitle = encodeURIComponent(`Собеседование: ${candidate.firstName} ${candidate.lastName} - ${candidate.position}`);
    const eventDetails = encodeURIComponent(`Кандидат: ${candidate.firstName} ${candidate.lastName}\nДолжность: ${candidate.position}\nОпыт: ${candidate.experience}`);
    
    // Получаем настройки из localStorage
    const settings = JSON.parse(localStorage.getItem('talkpro_settings') || '{}');
    const connectedServices = settings.connectedServices || {};
    
    let calendarUrl = '';
    
    if (connectedServices.gmail || service === 'gmail') {
      // Google Calendar
      const startTime = new Date();
      startTime.setHours(startTime.getHours() + 1);
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
      
      const startStr = startTime.toISOString().replace(/-|:|\.\d+/g, '');
      const endStr = endTime.toISOString().replace(/-|:|\.\d+/g, '');
      
      calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&details=${eventDetails}&dates=${startStr}/${endStr}`;
    } else if (connectedServices.yandex || service === 'yandex') {
      // Яндекс.Календарь
      calendarUrl = `https://calendar.yandex.ru/?event&title=${eventTitle}&description=${eventDetails}`;
    } else {
      // По умолчанию Google Calendar
      const startTime = new Date();
      startTime.setHours(startTime.getHours() + 1);
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
      
      const startStr = startTime.toISOString().replace(/-|:|\.\d+/g, '');
      const endStr = endTime.toISOString().replace(/-|:|\.\d+/g, '');
      
      calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&details=${eventDetails}&dates=${startStr}/${endStr}`;
    }
    
    window.open(calendarUrl, '_blank');
  };

  // Обработчик нажатия на кнопку запланировать звонок
  const handleScheduleCall = (e) => {
    e.stopPropagation();
    
    // Получаем настройки из localStorage
    const settings = JSON.parse(localStorage.getItem('talkpro_settings') || '{}');
    const connectedServices = settings.connectedServices || {};
    
    // Определяем, какой календарь использовать
    if (connectedServices.gmail) {
      openCalendar('gmail');
    } else if (connectedServices.yandex) {
      openCalendar('yandex');
    } else {
      // Если ни один календарь не подключен, показываем сообщение
      if (window.confirm('У вас не подключен ни один календарь. Хотите перейти в настройки для подключения?')) {
        navigate('/settings');
      } else {
        // Если пользователь не хочет переходить в настройки, открываем Google Calendar по умолчанию
        openCalendar('gmail');
      }
    }
  };

  // Обработчик раскрытия/сворачивания блока
  const handleToggleExpand = (e) => {
    e.stopPropagation()
    
    // Если есть другая активная карточка и это не текущая, закрываем её
    if (activeCardId && activeCardId !== cardId) {
      // Отправляем событие для закрытия другой карточки
      const event = new CustomEvent('closeOtherCard', { detail: { excludeId: cardId } });
      window.dispatchEvent(event);
    }
    
    setIsExpanded(!isExpanded)
    activeCardId = !isExpanded ? cardId : null
  }

  // Слушаем событие закрытия других карточек
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

  // Функция для определения класса вероятности ИИ
  const getAiProbabilityClass = (probability) => {
    if (probability > 70) return 'critical'
    if (probability > 40) return 'high'
    if (probability > 15) return 'medium'
    return 'low'
  }

  // Исправленная логика формирования списков
  const getStrengths = () => {
    // Если есть strengths от сервера и их больше 0
    if (candidate.strengths && candidate.strengths.length > 0) {
      // Берем первые 3 элемента
      return candidate.strengths.slice(0, 3);
    }
    
    // Возвращаем 3 пункта по умолчанию
    return [
      'Опыт работы с современными фреймворками',
      'Хорошее знание TypeScript',
      'Навыки командной работы'
    ];
  };

  const getImprovements = () => {
    // Если есть improvements от сервера и их больше 0
    if (candidate.improvements && candidate.improvements.length > 0) {
      // Берем первые 2 элемента
      return candidate.improvements.slice(0, 2);
    }
    
    // Возвращаем 2 пункта по умолчанию
    return [
      'Не хватает опыта работы с GraphQL',
      'Рекомендуется добавить пет-проекты'
    ];
  };

  const strengths = getStrengths();
  const improvements = getImprovements();

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
        
        {/* Оценка резюме в правом верхнем углу (только цифры) */}
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
        
        {/* Кнопка Подробнее с иконкой */}
        <button 
          className={`details-btn ${isExpanded ? 'expanded' : ''}`}
          onClick={handleToggleExpand}
        >
          <span>{isExpanded ? 'Скрыть' : 'Подробнее'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Компактный AI-анализ (виден всегда) */}
      <div className="compact-ai-analysis">
        <div className="compact-ai-score">
          <span className="compact-ai-label">Вероятность ИИ:</span>
          <span className={`compact-ai-value ${getAiProbabilityClass(candidate.aiProbability || 0)}`}>
            {candidate.aiProbability || 0}%
          </span>
        </div>
        {candidate.suspiciousPhrases && candidate.suspiciousPhrases.length > 0 && (
          <div className="compact-warning" title={candidate.suspiciousPhrases[0]}>
            <AlertCircle size={14} />
            <span>Есть подозрительные фразы</span>
          </div>
        )}
      </div>

      {/* Разворачивающийся блок с детальной информацией */}
      {isExpanded && (
        <div className="expandable-details">
          {/* Кнопка запланировать звонок (для мобильных) */}
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
                <span>Подозрительные фразы (возможно сгенерированы ИИ):</span>
              </div>
              <ul className="phrases-list red-text">
                {candidate.suspiciousPhrases.slice(0, 3).map((phrase, idx) => (
                  <li key={idx}>
                    <span className="phrase-quote red-text">«</span>
                    {phrase}
                    <span className="phrase-quote red-text">»</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Сильные стороны (3 пункта) */}
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

          {/* Что улучшить (2 пункта) */}
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

          {/* Кнопка запланировать звонок */}
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