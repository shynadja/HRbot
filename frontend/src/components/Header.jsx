import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Settings, User } from 'lucide-react'
import './Header.css'

const Header = ({ onSettingsClick }) => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const goToAdminPanel = () => {
    navigate('/admin')
  }

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">TalkPro</div>
        {user?.role === 'admin' && (
          <button 
            className="admin-badge" 
            onClick={goToAdminPanel}
            title="Панель администратора"
          >
            <User size={16} />
            <span>Admin</span>
          </button>
        )}
      </div>
      
      <div className="header-right">
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
        </div>
        
        <button className="settings-btn" onClick={onSettingsClick}>
          <Settings size={20} />
        </button>
        
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}

export default Header