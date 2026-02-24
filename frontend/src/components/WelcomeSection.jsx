import React from 'react'
import './WelcomeSection.css'
import logo from '../assets/images/logo.png'

const WelcomeSection = () => {
  return (
    <section className="welcome-section">
      <div className="welcome-image">
        <img src={logo} alt="TalkPro" className="main-logo" />
      </div>
      <div className="welcome-text">
        <h2>Добро пожаловать в TalkPro!</h2>
        <p>Я помогу вам с подбором кандидатов, организацией встреч и анализом резюме</p>
      </div>
    </section>
  )
}

export default WelcomeSection