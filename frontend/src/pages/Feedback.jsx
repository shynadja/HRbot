import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Feedback.css'

const Feedback = () => {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    if (!message.trim()) {
      alert('Пожалуйста, введите сообщение')
      return
    }

    setSending(true)
    
    // Здесь будет отправка на бекенд
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    setSending(false)
    navigate('/')
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Обратная связь</h1>
      </div>
      <div className="feedback-content">
        <textarea
          className="feedback-textarea"
          placeholder="Введите ваше сообщение..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        
        <div className="feedback-buttons">
          <button 
            className="feedback-submit-btn"
            onClick={handleSubmit}
            disabled={sending}
          >
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
          <button 
            className="feedback-cancel-btn"
            onClick={() => navigate('/')}
            disabled={sending}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default Feedback