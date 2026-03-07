import React, { createContext, useState, useContext, useEffect, useCallback } from 'react'
import axios from 'axios'
import { api } from '../services/api'

const AuthContext = createContext()
const API_URL = import.meta.env.VITE_API_URL

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Используем useCallback для функции загрузки пользователя
  const loadUser = useCallback(() => {
    try {
      const savedUser = localStorage.getItem('talkpro_user')
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser)
        setUser(parsedUser)
      }
    } catch (error) {
      console.error('Error loading user from localStorage:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/login`, {
        email,
        password
      })
      
      if (response.data.success) {
        const userData = response.data.user
        setUser(userData)
        localStorage.setItem('talkpro_user', JSON.stringify(userData))
        
        // Логируем вход (опционально, так как сервер уже залогировал)
        api.logAction({
          action: 'login',
          user_id: userData.id,
          user_name: userData.name,
          details: `Вход в систему`
        }).catch(err => console.error('Error logging login:', err))
        
        return { success: true, user: userData }
      }
    } catch (error) {
      console.error('Login error:', error)
      throw new Error(error.response?.data?.error || 'Ошибка при входе в систему')
    }
  }

  const logout = useCallback(() => {
    if (user) {
      // Логируем выход
      api.logAction({
        action: 'logout',
        user_id: user.id,
        user_name: user.name,
        details: 'Выход из системы'
      }).catch(err => console.error('Error logging logout:', err))
    }
    
    setUser(null)
    localStorage.removeItem('talkpro_user')
  }, [user])

  const value = {
    user,
    login,
    logout,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }