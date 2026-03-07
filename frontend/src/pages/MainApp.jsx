import React, { useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import WelcomeSection from '../components/WelcomeSection'
import ActionButtons from '../components/ActionButtons'
import FeedbackButton from '../components/FeedbackButton'
import Notification from '../components/Notification'
import UploadResume from './UploadResume'
import CheckResume from './CheckResume'
import FindCandidate from './FindCandidate'
import ScheduleMeeting from './ScheduleMeeting'
import Settings from './Settings'
import Feedback from './Feedback'
import { useAuth } from '../hooks/useAuth'

const MainApp = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [notification, setNotification] = useState({ show: false, message: '', isError: false })

  const showNotification = (message, isError = false) => {
    setNotification({ show: true, message, isError })
    setTimeout(() => {
      setNotification({ show: false, message: '', isError: false })
    }, 3000)
  }

  const handleAction = async (action) => {
    try {
      switch(action) {
        case 'upload_resume':
          navigate('/upload-resume')
          break
        case 'check_resume':
          navigate('/check-resume')
          break
        case 'find_candidate':
          navigate('/find-candidate')
          break
        case 'schedule_meeting':
          navigate('/schedule-meeting')
          break
        default:
          showNotification(`Действие "${getActionName(action)}" выполнено!`)
      }
    } catch (error) {
      console.error('Error handling action:', error)
      showNotification('Ошибка выполнения действия', true)
    }
  }

  const getActionName = (action) => {
    const actions = {
      'upload_resume': 'Загрузить резюме',
      'check_resume': 'Проверить резюме',
      'find_candidate': 'Подобрать сотрудника',
      'schedule_meeting': 'Поставить встречу'
    }
    return actions[action] || action
  }

  const openSettings = () => {
    navigate('/settings')
  }

  const openFeedback = () => {
    navigate('/feedback')
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
          <Route path="/upload-resume" element={<UploadResume />} />
          <Route path="/check-resume" element={<CheckResume />} />
          <Route path="/find-candidate" element={<FindCandidate />} />
          <Route path="/schedule-meeting" element={<ScheduleMeeting />} />
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

export default MainApp