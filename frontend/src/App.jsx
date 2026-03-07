import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import MainApp from './pages/MainApp'
import AdminPanel from './pages/AdminPanel'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import './App.css'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>
  }

  // Не авторизован - только login
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  // Авторизован - показываем соответствующий интерфейс
  return (
    <Routes>
      {/* Для админа - только админка */}
      {user.role === 'admin' ? (
        <>
          <Route path="/admin/*" element={<AdminPanel />} />
          <Route path="*" element={<Navigate to="/admin" />} />
        </>
      ) : (
        // Для обычного пользователя - только основное приложение
        <>
          <Route path="/*" element={<MainApp />} />
        </>
      )}
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App