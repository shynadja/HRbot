import React from 'react'
import { FileText } from 'lucide-react'
import './ResumeCard.css'

const ResumeCard = ({ 
  resume, 
  selected = false, 
  onSelect, 
  showCheckbox = true,
  onClick 
}) => {
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Б'
    if (bytes < 1024) return bytes + ' Б'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
  }

  const formatDateTime = (dateString) => {
    try {
      const date = new Date(dateString)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const timeStr = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })

      if (date.toDateString() === today.toDateString()) {
        return `Сегодня в ${timeStr}`
      } else if (date.toDateString() === yesterday.toDateString()) {
        return `Вчера в ${timeStr}`
      } else {
        const dateStr = date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
        return `${dateStr}`
      }
    } catch {
      return 'Дата неизвестна'
    }
  }

  const getFileExtension = (fileName) => {
    return fileName?.split('.').pop()?.toUpperCase() || ''
  }

  const handleClick = (e) => {
    if (onClick) {
      onClick(resume)
    }
    if (onSelect) {
      onSelect(resume.id)
    }
  }

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(resume.id)
    }
  }

  return (
    <div 
      className={`resume-card ${selected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      {showCheckbox && (
        <div 
          className="resume-card-checkbox"
          onClick={handleCheckboxClick}
        >
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#229ED9" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}
      
      <div className="resume-card-icon">
        <FileText size={20} color="#229ED9" />
      </div>
      
      <div className="resume-card-content">
        <div className="resume-card-header">
          <span className="resume-card-filename">{resume.name || resume.file_name}</span>
          <span className="resume-card-extension">{getFileExtension(resume.name || resume.file_name)}</span>
        </div>
        
        <div className="resume-card-metadata">
          <span className="resume-card-size">{formatFileSize(resume.file_size || resume.rawSize)}</span>
          <span className="resume-card-dot">•</span>
          <span className="resume-card-date">{formatDateTime(resume.upload_date || resume.uploadDate)}</span>
        </div>
        
        <div className="resume-card-candidate">
          <span className="resume-card-name">{resume.full_name || resume.candidate_name || 'Имя не указано'}</span>
          <span className="resume-card-dot">•</span>
          <span className="resume-card-position">{resume.position || 'Должность не указана'}</span>
        </div>
        
        {resume.skills && resume.skills.length > 0 && (
          <div className="resume-card-skills">
            {resume.skills.slice(0, 5).map((skill, idx) => (
              <span key={idx} className="resume-card-skill">{skill}</span>
            ))}
            {resume.skills.length > 5 && (
              <span className="resume-card-skill more">+{resume.skills.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ResumeCard