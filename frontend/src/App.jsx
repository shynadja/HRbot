import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import WelcomeSection from './components/WelcomeSection'
import ActionButtons from './components/ActionButtons'
import FeedbackButton from './components/FeedbackButton'
import Notification from './components/Notification'
import ColdSearch1 from './pages/ColdSearch1'
import ColdSearch2 from './pages/ColdSearch2'
import ScheduleMeeting from './pages/ScheduleMeeting'
import CheckResume from './pages/CheckResume'
import Settings from './pages/Settings'
import Feedback from './pages/Feedback'
import { initTelegram, getUserData } from './services/telegram'
import { api } from './services/api'
import './App.css'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [notification, setNotification] = useState({ show: false, message: '', isError: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      // Инициализация Telegram
      const tg = initTelegram()
      
      // Получаем user_id из URL если есть
      const params = new URLSearchParams(window.location.search)
      const userId = params.get('user_id')
      
      if (userId) {
        try {
          const userData = await api.getUser(userId)
          setUser(userData)
        } catch (error) {
          console.error('Error loading user:', error)
        }
      } else {
        // Пробуем получить данные из Telegram
        const telegramUser = getUserData()
        if (telegramUser) {
          setUser(telegramUser)
        }
      }
      
      setLoading(false)
    }
    
    init()
  }, [])

  const showNotification = (message, isError = false) => {
    setNotification({ show: true, message, isError })
    setTimeout(() => {
      setNotification({ show: false, message: '', isError: false })
    }, 3000)
  }

  const handleAction = async (action) => {
    try {
      // Эффект нажатия можно добавить через CSS класс
      
      // Отправляем действие на бекенд
      if (user?.id) {
        await api.logAction(action, user.id)
      }
      
      // Навигация на соответствующую страницу
      switch(action) {
        case 'cold_search_1':
          navigate('/cold-search-1')
          break
        case 'cold_search_2':
          navigate('/cold-search-2')
          break
        case 'schedule_meeting':
          navigate('/schedule-meeting')
          break
        case 'check_resume':
          navigate('/check-resume')
          break
        default:
          showNotification(`Действие "${getActionName(action)}" выполнено!`)
      }
      
      // Отправка в Telegram
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.sendData(JSON.stringify({
          action: action,
          status: 'completed'
        }))
      }
    } catch (error) {
      console.error('Error handling action:', error)
      showNotification('Ошибка выполнения действия', true)
    }
  }

  const getActionName = (action) => {
    const actions = {
      'cold_search_1': 'Холодный подбор 1',
      'cold_search_2': 'Холодный подбор 2',
      'schedule_meeting': 'Поставить встречу',
      'check_resume': 'Проверить резюме'
    }
    return actions[action] || action
  }

  const openSettings = () => {
    navigate('/settings')
  }

  const openFeedback = () => {
    navigate('/feedback')
  }

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>
  }

  return (
    <div className="container">
      {location.pathname === '/' ? (
        <>
          <Header onSettingsClick={openSettings} />
          <main className="main-content">
            <WelcomeSection />
            <ActionButtons onAction={handleAction} />
            <FeedbackButton onClick={openFeedback} />
          </main>
        </>
      ) : (
        <Routes>
          <Route path="/cold-search-1" element={<ColdSearch1 />} />
          <Route path="/cold-search-2" element={<ColdSearch2 />} />
          <Route path="/schedule-meeting" element={<ScheduleMeeting />} />
          <Route path="/check-resume" element={<CheckResume />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/feedback" element={<Feedback />} />
        </Routes>
      )}
      
      {notification.show && (
        <Notification 
          message={notification.message} 
          isError={notification.isError}
          onClose={() => setNotification({ show: false, message: '', isError: false })}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
