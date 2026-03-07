import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import './Feedback.css'

const Feedback = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Пожалуйста, введите сообщение')
      return
    }

    setSending(true)
    setError('')
    
    try {
      const result = await api.sendFeedback({
        message: message.trim(),
        userId: user?.id || 'anonymous',
        userName: user?.name || 'Гость',
        userEmail: user?.email || '',
        userRole: user?.role || 'guest'
      })
      
      if (result.success) {
        // Очищаем поле и показываем успех
        setMessage('')
        // Можно показать уведомление об успехе
        setTimeout(() => {
          navigate('/')
        }, 1500)
      }
    } catch (err) {
      console.error('Error sending feedback:', err)
      setError('Ошибка при отправке сообщения. Попробуйте позже.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Обратная связь</h1>
      </div>
      <div className="feedback-content">
        {error && (
          <div className="feedback-error">
            {error}
          </div>
        )}
        
        <textarea
          className={`feedback-textarea ${error ? 'error' : ''}`}
          placeholder="Введите ваше сообщение..."
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            if (error) setError('')
          }}
          disabled={sending}
        />
        
        <div className="feedback-buttons">
          <button 
            className={`feedback-submit-btn ${sending ? 'sending' : ''}`}
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
        
        {sending && (
          <div className="feedback-sending">
            Отправка сообщения...
          </div>
        )}
      </div>
    </div>
  )
}

export default Feedback