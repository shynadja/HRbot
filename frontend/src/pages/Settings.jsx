import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Mail, Check, X } from 'lucide-react'
import './Settings.css'

const Settings = () => {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(true)
  
  // Состояния для подключенных сервисов
  const [connectedServices, setConnectedServices] = useState({
    hhru: false,
    gmail: false,
    yandex: false
  })

  // Состояния для модальных окон
  const [showModal, setShowModal] = useState(null) // 'hhru', 'gmail', 'yandex'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Обработка подключения сервиса
  const handleConnect = (service) => {
    setShowModal(service)
    // Сбрасываем поля
    setEmail('')
    setPassword('')
    setApiKey('')
  }

  // Обработка сохранения подключения
  const handleSaveConnection = () => {
    if (showModal) {
      setConnectedServices({
        ...connectedServices,
        [showModal]: true
      })
      setShowModal(null)
    }
  }

  // Обработка отключения сервиса
  const handleDisconnect = (service) => {
    setConnectedServices({
      ...connectedServices,
      [service]: false
    })
  }

  // Закрытие модального окна
  const closeModal = () => {
    setShowModal(null)
  }

  // Получение названия сервиса
  const getServiceName = (service) => {
    const names = {
      hhru: 'hh.ru',
      gmail: 'Gmail',
      yandex: 'Яндекс.Почта'
    }
    return names[service]
  }

  // Получение иконки сервиса
  const getServiceIcon = (service) => {
    switch(service) {
      case 'hhru':
        return <Briefcase size={24} className="service-icon" />
      case 'gmail':
        return <Mail size={24} className="service-icon" />
      case 'yandex':
        return <Mail size={24} className="service-icon" />
      default:
        return null
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Настройки</h1>
      </div>
      
      <div className="settings-content">
        {/* Уведомления */}
        <div className="settings-section">
          <h2 className="settings-section-title">Уведомления</h2>
          <div className="settings-item">
            <span className="settings-item-label">Push-уведомления</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>

        {/* Подключенные сервисы */}
        <div className="settings-section">
          <h2 className="settings-section-title">Подключенные сервисы</h2>
          
          {/* hh.ru */}
          <div className="service-item">
            <div className="service-info">
              <Briefcase size={24} className="service-icon" />
              <span className="service-name">hh.ru</span>
            </div>
            {connectedServices.hhru ? (
              <div className="service-status connected">
                <span className="status-badge">
                  <Check size={16} />
                  Подключено
                </span>
                <button 
                  className="service-disconnect"
                  onClick={() => handleDisconnect('hhru')}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button 
                className="service-connect"
                onClick={() => handleConnect('hhru')}
              >
                Подключить
              </button>
            )}
          </div>

          {/* Gmail */}
          <div className="service-item">
            <div className="service-info">
              <Mail size={24} className="service-icon" />
              <span className="service-name">Gmail</span>
            </div>
            {connectedServices.gmail ? (
              <div className="service-status connected">
                <span className="status-badge">
                  <Check size={16} />
                  Подключено
                </span>
                <button 
                  className="service-disconnect"
                  onClick={() => handleDisconnect('gmail')}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button 
                className="service-connect"
                onClick={() => handleConnect('gmail')}
              >
                Подключить
              </button>
            )}
          </div>

          {/* Яндекс.Почта */}
          <div className="service-item">
            <div className="service-info">
              <Mail size={24} className="service-icon" />
              <span className="service-name">Яндекс.Почта</span>
            </div>
            {connectedServices.yandex ? (
              <div className="service-status connected">
                <span className="status-badge">
                  <Check size={16} />
                  Подключено
                </span>
                <button 
                  className="service-disconnect"
                  onClick={() => handleDisconnect('yandex')}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button 
                className="service-connect"
                onClick={() => handleConnect('yandex')}
              >
                Подключить
              </button>
            )}
          </div>
        </div>

        <button className="settings-save-btn" onClick={() => navigate('/')}>
          Сохранить
        </button>
      </div>

      {/* Модальное окно для подключения сервиса */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-info">
                {getServiceIcon(showModal)}
                <h3 className="modal-title">Подключение к {getServiceName(showModal)}</h3>
              </div>
              <button className="modal-close" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              {showModal === 'hhru' ? (
                // Форма для hh.ru
                <>
                  <div className="modal-field">
                    <label className="modal-label">Email</label>
                    <input
                      type="email"
                      className="modal-input"
                      placeholder="Введите email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Пароль</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="Введите пароль"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                // Форма для почтовых сервисов
                <>
                  <div className="modal-field">
                    <label className="modal-label">Email</label>
                    <input
                      type="email"
                      className="modal-input"
                      placeholder="Введите email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Пароль приложения</label>
                    <input
                      type="password"
                      className="modal-input"
                      placeholder="Введите пароль приложения"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <p className="modal-hint">
                    Для Gmail и Яндекс.Почты введите пароль приложения, а не основной пароль
                  </p>
                </>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeModal}>
                Отмена
              </button>
              <button 
                className="modal-save"
                onClick={handleSaveConnection}
                disabled={!email || !password}
              >
                Подключить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings