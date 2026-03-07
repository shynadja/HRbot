import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react'
import axios from 'axios'
import './Login.css'

const API_URL = import.meta.env.VITE_API_URL

const Login = () => {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Отправляем запрос на сервер для аутентификации
      const response = await axios.post(`${API_URL}/login`, {
        email,
        password
      })
      
      if (response.data.success) {
        // Используем существующую функцию login из контекста
        await authLogin(email, password)
        navigate('/')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(err.response?.data?.error || 'Ошибка при входе в систему')
    } finally {
      setIsLoading(false)
    }
  }

  // Для быстрого тестирования
  const fillDemoCredentials = (role) => {
    if (role === 'user') {
      setEmail('user@example.com')
      setPassword('user123')
    } else {
      setEmail('admin@example.com')
      setPassword('admin123')
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src="/src/assets/images/logo.png" alt="TalkPro" />
          </div>
          <h1 className="login-title">Добро пожаловать в TalkPro</h1>
          <p className="login-subtitle">Войдите в систему для продолжения работы</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <Mail size={16} />
              Email
            </label>
            <input
              type="email"
              id="email"
              className={`form-input ${email ? 'has-value' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Введите email"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <Lock size={16} />
              Пароль
            </label>
            <input
              type="password"
              id="password"
              className={`form-input ${password ? 'has-value' : ''}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              disabled={isLoading}
            />
          </div>

          <button 
            type="submit" 
            className={`login-button ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <span>Вход...</span>
            ) : (
              <>
                <LogIn size={18} />
                <span>Войти</span>
              </>
            )}
          </button>
        </form>

        {/* Демо-кнопки для тестирования */}
        <div className="demo-buttons">
          <p className="demo-title">Демо-доступ:</p>
          <div className="demo-grid">
            <button 
              className="demo-btn user" 
              onClick={() => fillDemoCredentials('user')}
              type="button"
            >
              Пользователь
            </button>
            <button 
              className="demo-btn admin" 
              onClick={() => fillDemoCredentials('admin')}
              type="button"
            >
              Администратор
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login