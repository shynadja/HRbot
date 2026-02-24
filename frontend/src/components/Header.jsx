import React from 'react'
import './Header.css'
import settingsIcon from '../assets/images/settings-icon.png'

const Header = ({ onSettingsClick }) => {
  return (
    <header className="header">
      <div className="logo">TalkPro</div>
      <button className="settings-btn" onClick={onSettingsClick}>
        <img src={settingsIcon} alt="Настройки" className="settings-icon" />
      </button>
    </header>
  )
}

export default Header