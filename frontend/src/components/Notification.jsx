import React, { useEffect } from 'react'
import './Notification.css'

const Notification = ({ message, isError, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`notification ${isError ? 'error' : ''}`}>
      {message}
    </div>
  )
}

export default Notification