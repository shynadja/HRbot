import React from 'react'
import './ActionButtons.css'
import searchIcon from '../assets/images/search-icon.png'
import calendarIcon from '../assets/images/calendar-icon.png'
import clipboardIcon from '../assets/images/clipboard-icon.png'

const ActionButtons = ({ onAction }) => {
  const buttons = [
    {
      id: 'cold_search_1',
      icon: searchIcon,
      text: 'Холодный подбор 1',
      subtext: 'Поиск кандидатов'
    },
    {
      id: 'cold_search_2',
      icon: searchIcon,
      text: 'Холодный подбор 2',
      subtext: 'Поиск кандидатов'
    },
    {
      id: 'schedule_meeting',
      icon: calendarIcon,
      text: 'Поставить встречу',
      subtext: 'Запланировать интервью'
    },
    {
      id: 'check_resume',
      icon: clipboardIcon,
      text: 'Проверить резюме',
      subtext: 'Анализ резюме и рекомендации'
    }
  ]

  const handleClick = (buttonId, e) => {
    // Эффект нажатия
    const btn = e.currentTarget
    btn.style.transform = 'translateY(2px)'
    btn.style.boxShadow = '0 2px 8px rgba(34, 158, 217, 0.3)'
    
    setTimeout(() => {
      btn.style.transform = ''
      btn.style.boxShadow = ''
    }, 150)
    
    onAction(buttonId)
  }

  return (
    <section className="buttons-grid">
      {buttons.map((button, index) => (
        <button
          key={button.id}
          className="action-btn"
          onClick={(e) => handleClick(button.id, e)}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="btn-icon">
            <img src={button.icon} alt={button.text} className="btn-icon-img" />
          </div>
          <div className="btn-content">
            <div className="btn-text">{button.text}</div>
            <div className="btn-subtext">{button.subtext}</div>
          </div>
        </button>
      ))}
    </section>
  )
}

export default ActionButtons