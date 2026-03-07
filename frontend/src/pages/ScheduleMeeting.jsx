import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Clock, Users, CheckCircle } from 'lucide-react';
import './ScheduleMeeting.css';

const ScheduleMeeting = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCreating, setIsCreating] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [participants, setParticipants] = useState('');

  // Заполняем данные, если переданы из другого компонента
  useEffect(() => {
    if (location.state) {
      const { candidate, position } = location.state;
      if (candidate && position) {
        setParticipants(`${candidate} (${position})`);
      }
    }
  }, [location.state]);

  const isFormValid = meetingDate && meetingTime && participants.trim();

  const handleCreateMeeting = () => {
    if (!isFormValid) return
    
    setIsCreating(true)
    
    setTimeout(() => {
      setIsCreating(false)
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 5000)
    }, 1500)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Поставить встречу</h1>
      </div>
      
      <div className="schedule-meeting-content">
        <p className="meeting-description">
          Заполните данные для создания встречи
        </p>
        
        <div className="meeting-form">
          {/* Дата встречи */}
          <div className="form-group">
            <div className="form-label-with-icon">
              <Calendar size={20} color="#229ED9" />
              <label className="form-label">Дата встречи</label>
            </div>
            <input
              type="date"
              className={`form-input ${meetingDate ? 'has-value' : ''}`}
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              placeholder="дд.мм.гггг"
            />
          </div>

          {/* Время встречи */}
          <div className="form-group">
            <div className="form-label-with-icon">
              <Clock size={20} color="#229ED9" />
              <label className="form-label">Время встречи</label>
            </div>
            <input
              type="time"
              className={`form-input ${meetingTime ? 'has-value' : ''}`}
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
              placeholder="--:--"
            />
          </div>

          {/* Участники встречи */}
          <div className="form-group">
            <div className="form-label-with-icon">
              <Users size={20} color="#229ED9" />
              <label className="form-label">Участники встречи</label>
            </div>
            <input
              type="text"
              className={`form-input ${participants ? 'has-value' : ''}`}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Введите имена участников через запятую..."
            />
          </div>
        </div>
        
        <button 
          className={`create-button ${isFormValid ? 'active' : ''}`}
          onClick={handleCreateMeeting}
          disabled={!isFormValid || isCreating}
        >
          {isCreating ? 'Создание...' : 'Создать встречу'}
        </button>

        {showNotification && (
          <div className="meeting-notification">
            <div className="notification-content">
              <CheckCircle size={24} color="#229ED9" />
              <div className="notification-text">
                <strong>Встреча создана!</strong>
                <p>{meetingDate} в {meetingTime}</p>
              </div>
            </div>
            <button className="calendar-link" onClick={() => alert('Переход в календарь')}>
              Перейти в календарь →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScheduleMeeting