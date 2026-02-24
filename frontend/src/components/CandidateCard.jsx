import React, { useState } from 'react'
import { Phone, CheckCircle, AlertCircle, ThumbsUp, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import './CandidateCard.css'

let activeCardId = null; // Глобальный идентификатор активной карточки

const CandidateCard = ({ candidate }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const cardId = candidate.id

  // Обработчик нажатия на телефон
  const handlePhoneClick = (e) => {
    e.stopPropagation()
    if (candidate.phone) {
      window.location.href = `tel:${candidate.phone}`
    } else {
      alert('Телефон не указан')
    }
  }

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

  return (
    <div className={`candidate-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="candidate-header">
        <div className="candidate-initials">
          {candidate.firstName[0]}
        </div>
        <div className="candidate-name-info">
          <div className="candidate-fullname">
            {candidate.firstName} {candidate.lastName}
          </div>
          <div className="candidate-position">
            {candidate.position}
          </div>
        </div>
      </div>
      
      <div className="candidate-details">
        <div className="detail-item">
          <svg className="detail-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6H16V4C16 2.89 15.11 2 14 2H10C8.89 2 8 2.89 8 4V6H4C2.89 6 2.01 6.89 2.01 8L2 19C2 20.11 2.89 21 4 21H20C21.11 21 22 20.11 22 19V8C22 6.89 21.11 6 20 6ZM14 6H10V4H14V6Z" fill="#229ED9"/>
          </svg>
          <span className="detail-text">{candidate.company}</span>
        </div>
        
        <div className="detail-item">
          <svg className="detail-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12 6C10.9 6 10 6.9 10 8C10 9.1 10.9 10 12 10C13.1 10 14 9.1 14 8C14 6.9 13.1 6 12 6ZM16 13V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V13C8 11.9 8.9 11 10 11H14C15.1 11 16 11.9 16 13Z" fill="#229ED9"/>
          </svg>
          <span className="detail-text">{candidate.experience}</span>
        </div>
      </div>
      
      <div className="candidate-skills-wrapper">
        <div className="candidate-skills">
          {candidate.skills.map((skill, index) => (
            <span key={index} className="skill-tag">{skill}</span>
          ))}
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

      {/* Разворачивающийся блок с детальной информацией */}
      {isExpanded && (
        <div className="expandable-details">
          {/* Кнопка звонка (только для мобильных) */}
          {candidate.phone && (
            <button 
              className="expandable-call-btn-mobile"
              onClick={handlePhoneClick}
            >
              <Phone size={18} />
              <span>Позвонить кандидату</span>
            </button>
          )}

          <div className="expandable-section">
            <h4 className="expandable-section-title">Детальная информация</h4>
            <div className="expandable-info-grid">
              <div className="expandable-info-item">
                <span className="expandable-info-label">Должность:</span>
                <span className="expandable-info-value">{candidate.position}</span>
              </div>
              <div className="expandable-info-item">
                <span className="expandable-info-label">Компания:</span>
                <span className="expandable-info-value">{candidate.company}</span>
              </div>
              <div className="expandable-info-item">
                <span className="expandable-info-label">Опыт:</span>
                <span className="expandable-info-value">{candidate.experience}</span>
              </div>
              <div className="expandable-info-item">
                <span className="expandable-info-label">Навыки:</span>
                <span className="expandable-info-value">{candidate.skills.join(', ')}</span>
              </div>
            </div>
          </div>

          <div className="expandable-section">
            <div className="analysis-header">
              <span className="analysis-title">Анализ резюме</span>
              <div className="analysis-score">
                <span className="score-value">{candidate.score || 85}</span>
                <span className="score-total">/100</span>
              </div>
            </div>

            {/* Сильные стороны */}
            <div className="analysis-section strengths">
              <div className="section-header">
                <CheckCircle size={18} className="section-icon" />
                <span className="section-title">Сильные стороны</span>
              </div>
              <ul className="section-list">
                {candidate.strengths ? (
                  candidate.strengths.map((item, index) => (
                    <li key={index} className="section-item">
                      <ThumbsUp size={14} className="item-icon" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <>
                    <li className="section-item">
                      <ThumbsUp size={14} className="item-icon" />
                      <span>Опыт работы с современными фреймворками</span>
                    </li>
                    <li className="section-item">
                      <ThumbsUp size={14} className="item-icon" />
                      <span>Хорошее знание TypeScript и архитектурных паттернов</span>
                    </li>
                    <li className="section-item">
                      <ThumbsUp size={14} className="item-icon" />
                      <span>Навыки командной работы и коммуникации</span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Что улучшить */}
            <div className="analysis-section improvements">
              <div className="section-header">
                <AlertCircle size={18} className="section-icon" />
                <span className="section-title">Что улучшить</span>
              </div>
              <ul className="section-list">
                {candidate.improvements ? (
                  candidate.improvements.map((item, index) => (
                    <li key={index} className="section-item">
                      <TrendingUp size={14} className="item-icon" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <>
                    <li className="section-item">
                      <TrendingUp size={14} className="item-icon" />
                      <span>Не хватает опыта работы с GraphQL</span>
                    </li>
                    <li className="section-item">
                      <TrendingUp size={14} className="item-icon" />
                      <span>Рекомендуется добавить раздел с пет-проектами</span>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Кнопка звонка (для десктопа) */}
          {candidate.phone && (
            <button 
              className="expandable-call-btn-desktop"
              onClick={handlePhoneClick}
            >
              <Phone size={18} />
              <span>Позвонить кандидату</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default CandidateCard