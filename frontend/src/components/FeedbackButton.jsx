import React from 'react'
import './FeedbackButton.css'
import feedbackIcon from '../assets/images/feedback-icon.png'

const FeedbackButton = ({ onClick }) => {
  return (
    <section className="feedback-section">
      <button className="feedback-btn" onClick={onClick}>
        <img src={feedbackIcon} alt="Обратная связь" className="feedback-icon" />
      </button>
    </section>
  )
}

export default FeedbackButton