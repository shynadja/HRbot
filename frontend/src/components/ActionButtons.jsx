import React from 'react'
import { Upload, FileCheck, Search, Calendar } from 'lucide-react'
import './ActionButtons.css'

const ActionButtons = ({ onAction }) => {
  const buttons = [
    {
      id: 'upload_resume',
      icon: Upload,
      text: 'Загрузить резюме',
      subtext: 'Добавить резюме в систему'
    },
    {
      id: 'check_resume',
      icon: FileCheck,
      text: 'Проверить резюме',
      subtext: 'Детекция ИИ'
    },
    {
      id: 'find_candidate',
      icon: Search,
      text: 'Подобрать сотрудника',
      subtext: 'Поиск по резюме'
    },
    {
      id: 'schedule_meeting',
      icon: Calendar,
      text: 'Поставить встречу',
      subtext: 'Запланировать интервью'
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
      {buttons.map((button, index) => {
        const Icon = button.icon
        return (
          <button
            key={button.id}
            className="action-btn"
            onClick={(e) => handleClick(button.id, e)}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="btn-icon">
              <Icon size={28} className="btn-icon-svg" />
            </div>
            <div className="btn-content">
              <div className="btn-text">{button.text}</div>
              <div className="btn-subtext">{button.subtext}</div>
            </div>
          </button>
        )
      })}
    </section>
  )
}

export default ActionButtons