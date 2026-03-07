import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { 
  Users, 
  BarChart3, 
  Settings, 
  LogOut,
  Activity,
  Database,
  FileText,
  Calendar,
  Search,
  Download,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  UserPlus,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Loader,
  Mail,
  Lock,
  User,
  Briefcase,
  X,
  Edit2,
  Trash2,
  Save,
  MessageSquare,
  Eye,
  EyeOff,
  Check
} from 'lucide-react'
import { api } from '../services/api'
import './AdminPanel.css'

const AdminPanel = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [feedback, setFeedback] = useState([])
  const [feedbackStats, setFeedbackStats] = useState(null)
  const [activities, setActivities] = useState([])
  const [logs, setLogs] = useState([])
  const [logsPagination, setLogsPagination] = useState({ page: 1, total: 0, pages: 1 })
  const [loading, setLoading] = useState({
    stats: true,
    users: true,
    feedback: true,
    activities: true,
    logs: true
  })
  const [error, setError] = useState(null)
  
  // Состояния для модального окна добавления пользователя
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active'
  })
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  // Состояния для редактирования пользователя
  const [editingUser, setEditingUser] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateSuccess, setUpdateSuccess] = useState('')

  // Состояния для удаления пользователя
  const [deletingUser, setDeletingUser] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Состояния для просмотра обращения
  const [viewingFeedback, setViewingFeedback] = useState(null)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  // Состояния для фильтрации обращений
  const [feedbackFilter, setFeedbackFilter] = useState('all') // all, new, in_progress, resolved

  // Функция загрузки логов с useCallback
  const loadLogs = useCallback(async (page) => {
    setLoading(prev => ({ ...prev, logs: true }))
    try {
      const logsData = await api.getSystemLogs(page, 20)
      setLogs(logsData.logs)
      setLogsPagination(logsData.pagination)
    } catch (err) {
      console.error('Error loading logs:', err)
      setError('Ошибка загрузки логов')
    } finally {
      setLoading(prev => ({ ...prev, logs: false }))
    }
  }, [])

  // Функция загрузки обращений
  const loadFeedback = useCallback(async () => {
    setLoading(prev => ({ ...prev, feedback: true }))
    try {
      const [feedbackData, statsData] = await Promise.all([
        api.getAllFeedback(),
        api.getFeedbackStats()
      ])
      setFeedback(feedbackData.feedback)
      setFeedbackStats(statsData.stats)
    } catch (err) {
      console.error('Error loading feedback:', err)
      setError('Ошибка загрузки обращений')
    } finally {
      setLoading(prev => ({ ...prev, feedback: false }))
    }
  }, [])

  // Функция загрузки всех данных с useCallback
  const loadData = useCallback(async () => {
    setError(null)
    
    try {
      // Загружаем статистику для дашборда
      if (activeTab === 'dashboard') {
        setLoading(prev => ({ ...prev, stats: true, activities: true }))
        const [statsData, activitiesData] = await Promise.all([
          api.getAdminStats(),
          api.getRecentActivities()
        ])
        setStats(statsData.stats)
        setActivities(activitiesData.activities)
      }
      
      // Загружаем пользователей
      if (activeTab === 'users') {
        setLoading(prev => ({ ...prev, users: true }))
        const usersData = await api.getAdminUsers()
        setUsers(usersData.users)
      }
      
      // Загружаем обращения
      if (activeTab === 'feedback') {
        await loadFeedback()
      }
      
      // Загружаем логи
      if (activeTab === 'logs') {
        await loadLogs(1)
      }
    } catch (err) {
      console.error('Error loading admin data:', err)
      setError('Ошибка загрузки данных. Проверьте подключение к серверу.')
    } finally {
      setLoading({
        stats: false,
        users: false,
        feedback: false,
        activities: false,
        logs: false
      })
    }
  }, [activeTab, loadLogs, loadFeedback])

  // Загрузка данных при монтировании и смене вкладки
  useEffect(() => {
    loadData()
  }, [loadData])

  // Загрузка данных для логов при смене страницы
  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs(logsPagination.page)
    }
  }, [logsPagination.page, activeTab, loadLogs])

  const handleLogout = useCallback(() => {
    // Логируем выход
    api.logAction({
      action: 'logout',
      user_id: user?.id,
      user_name: user?.name,
      details: 'Выход из админ-панели'
    }).finally(() => {
      logout()
      navigate('/login')
    })
  }, [user, logout, navigate])

  const handleRefresh = useCallback(() => {
    loadData()
  }, [loadData])

  const handleExport = useCallback(() => {
    // Логируем экспорт
    api.logAction({
      action: 'export_data',
      user_id: user?.id,
      user_name: user?.name,
      target: activeTab,
      details: `Экспорт данных из раздела ${activeTab}`
    })
    
    // Здесь будет логика экспорта
    alert('Функция экспорта в разработке')
  }, [user, activeTab])

  // ========== Обработчики для создания пользователя ==========
  const handleOpenAddUserModal = () => {
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: 'user',
      status: 'active'
    })
    setCreateError('')
    setCreateSuccess('')
    setShowAddUserModal(true)
  }

  const handleCloseAddUserModal = () => {
    setShowAddUserModal(false)
    setCreateError('')
    setCreateSuccess('')
    setIsCreating(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setNewUser(prev => ({
      ...prev,
      [name]: value
    }))
    if (createError) setCreateError('')
  }

  const validateForm = (userData) => {
    if (!userData.name.trim()) {
      setCreateError('Введите имя пользователя')
      return false
    }
    if (!userData.email.trim()) {
      setCreateError('Введите email')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      setCreateError('Введите корректный email')
      return false
    }
    if (!userData.password) {
      setCreateError('Введите пароль')
      return false
    }
    if (userData.password.length < 6) {
      setCreateError('Пароль должен содержать не менее 6 символов')
      return false
    }
    return true
  }

  const handleCreateUser = async () => {
    if (!validateForm(newUser)) return

    setIsCreating(true)
    setCreateError('')

    try {
      const response = await api.createUser(
        {
          name: newUser.name.trim(),
          email: newUser.email.trim(),
          password: newUser.password,
          role: newUser.role,
          status: newUser.status
        },
        user?.id,
        user?.name
      )

      if (response.success) {
        setUsers(prev => [response.user, ...prev])
        setCreateSuccess('Пользователь успешно создан!')
        
        setTimeout(() => {
          handleCloseAddUserModal()
        }, 2000)
      }
    } catch (err) {
      console.error('Error creating user:', err)
      setCreateError(err.response?.data?.error || 'Ошибка при создании пользователя')
    } finally {
      setIsCreating(false)
    }
  }

  // ========== Обработчики для редактирования пользователя ==========
  const handleOpenEditModal = (user) => {
    setEditingUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      password: ''
    })
    setUpdateError('')
    setUpdateSuccess('')
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setEditingUser(null)
    setUpdateError('')
    setUpdateSuccess('')
    setIsUpdating(false)
  }

  const handleEditInputChange = (e) => {
    const { name, value } = e.target
    setEditingUser(prev => ({
      ...prev,
      [name]: value
    }))
    if (updateError) setUpdateError('')
  }

  const validateEditForm = (userData) => {
    if (!userData.name.trim()) {
      setUpdateError('Введите имя пользователя')
      return false
    }
    if (!userData.email.trim()) {
      setUpdateError('Введите email')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      setUpdateError('Введите корректный email')
      return false
    }
    if (userData.password && userData.password.length > 0 && userData.password.length < 6) {
      setUpdateError('Пароль должен содержать не менее 6 символов')
      return false
    }
    return true
  }

  const handleUpdateUser = async () => {
    if (!validateEditForm(editingUser)) return

    setIsUpdating(true)
    setUpdateError('')

    try {
      const updateData = {
        name: editingUser.name.trim(),
        email: editingUser.email.trim(),
        role: editingUser.role,
        status: editingUser.status
      }

      if (editingUser.password && editingUser.password.trim() !== '') {
        updateData.password = editingUser.password
      }

      const response = await api.updateUser(
        editingUser.id,
        updateData,
        user?.id,
        user?.name
      )

      if (response.success) {
        setUsers(prev => prev.map(u => 
          u.id === editingUser.id ? response.user : u
        ))
        
        setUpdateSuccess('Пользователь успешно обновлен!')
        
        setTimeout(() => {
          handleCloseEditModal()
        }, 2000)
      }
    } catch (err) {
      console.error('Error updating user:', err)
      setUpdateError(err.response?.data?.error || 'Ошибка при обновлении пользователя')
    } finally {
      setIsUpdating(false)
    }
  }

  // ========== Обработчики для удаления пользователя ==========
  const handleOpenDeleteModal = (user) => {
    setDeletingUser(user)
    setDeleteError('')
    setShowDeleteModal(true)
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false)
    setDeletingUser(null)
    setDeleteError('')
    setIsDeleting(false)
  }

  const handleDeleteUser = async () => {
    if (!deletingUser) return

    setIsDeleting(true)
    setDeleteError('')

    try {
      const response = await api.deleteUser(
        deletingUser.id,
        user?.id,
        user?.name
      )

      if (response.success) {
        setUsers(prev => prev.filter(u => u.id !== deletingUser.id))
        
        api.logAction({
          action: 'delete_user',
          user_id: user?.id,
          user_name: user?.name,
          target: deletingUser.email,
          details: `Удален пользователь ${deletingUser.name}`
        })
        
        handleCloseDeleteModal()
      }
    } catch (err) {
      console.error('Error deleting user:', err)
      setDeleteError(err.response?.data?.error || 'Ошибка при удалении пользователя')
    } finally {
      setIsDeleting(false)
    }
  }

  // ========== Обработчики для обращений ==========
  const handleViewFeedback = (feedback) => {
    setViewingFeedback(feedback)
    setShowFeedbackModal(true)
    
    // Отмечаем как прочитанное
    if (!feedback.is_read) {
      api.markFeedbackAsRead(feedback.id)
        .then(() => {
          setFeedback(prev => prev.map(f => 
            f.id === feedback.id ? { ...f, is_read: true } : f
          ))
          if (feedbackStats) {
            setFeedbackStats(prev => ({
              ...prev,
              unread: prev.unread - 1
            }))
          }
        })
        .catch(err => console.error('Error marking feedback as read:', err))
    }
  }

  const handleCloseFeedbackModal = () => {
    setShowFeedbackModal(false)
    setViewingFeedback(null)
  }

  const handleUpdateFeedbackStatus = async (feedbackId, newStatus) => {
    try {
      const response = await api.updateFeedbackStatus(
        feedbackId,
        newStatus,
        user?.id,
        user?.name
      )

      if (response.success) {
        setFeedback(prev => prev.map(f => 
          f.id === feedbackId ? { ...f, status: newStatus } : f
        ))
        
        // Обновляем статистику
        if (feedbackStats) {
          const oldStatus = feedback.find(f => f.id === feedbackId)?.status
          const newStats = { ...feedbackStats }
          
          if (oldStatus) {
            newStats[oldStatus] = Math.max(0, (newStats[oldStatus] || 0) - 1)
          }
          newStats[newStatus] = (newStats[newStatus] || 0) + 1
          
          setFeedbackStats(newStats)
        }
      }
    } catch (err) {
      console.error('Error updating feedback status:', err)
    }
  }

  const handleDeleteFeedback = async (feedbackId) => {
    if (!window.confirm('Вы уверены, что хотите удалить это обращение?')) return

    try {
      const response = await api.deleteFeedback(
        feedbackId,
        user?.id,
        user?.name
      )

      if (response.success) {
        setFeedback(prev => prev.filter(f => f.id !== feedbackId))
        
        // Обновляем статистику
        if (feedbackStats) {
          const deletedFeedback = feedback.find(f => f.id === feedbackId)
          if (deletedFeedback) {
            const newStats = { ...feedbackStats }
            newStats.total = Math.max(0, newStats.total - 1)
            newStats[deletedFeedback.status] = Math.max(0, (newStats[deletedFeedback.status] || 0) - 1)
            if (!deletedFeedback.is_read) {
              newStats.unread = Math.max(0, newStats.unread - 1)
            }
            setFeedbackStats(newStats)
          }
        }
      }
    } catch (err) {
      console.error('Error deleting feedback:', err)
      alert('Ошибка при удалении обращения')
    }
  }

  const getFilteredFeedback = () => {
    if (feedbackFilter === 'all') return feedback
    return feedback.filter(f => f.status === feedbackFilter)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'completed':
        return <CheckCircle size={14} className="status-icon completed" />
      case 'pending':
        return <Clock size={14} className="status-icon pending" />
      case 'failed':
        return <XCircle size={14} className="status-icon failed" />
      default:
        return null
    }
  }

  const getFeedbackStatusBadge = (status) => {
    switch(status) {
      case 'new':
        return <span className="feedback-status new">Новое</span>
      case 'in_progress':
        return <span className="feedback-status in-progress">В обработке</span>
      case 'resolved':
        return <span className="feedback-status resolved">Решено</span>
      default:
        return <span className="feedback-status">{status}</span>
    }
  }

  const getLogLevelClass = (level) => {
    switch(level) {
      case 'error': return 'log-error'
      case 'warning': return 'log-warning'
      case 'info': return 'log-info'
      default: return 'log-info'
    }
  }

  if (error) {
    return (
      <div className="admin-container">
        <div className="error-state">
          <AlertCircle size={48} />
          <h3>Ошибка загрузки</h3>
          <p>{error}</p>
          <button onClick={handleRefresh} className="refresh-btn">
            <RefreshCw size={16} />
            <span>Повторить</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      {/* Боковое меню */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/src/assets/images/logo.png" alt="TalkPro" />
          </div>
          <h2 className="sidebar-title">TalkPro Admin</h2>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={20} />
            <span>Дашборд</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={20} />
            <span>Пользователи</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            <MessageSquare size={20} />
            <span>Обращения</span>
            {feedbackStats && feedbackStats.unread > 0 && (
              <span className="nav-badge">{feedbackStats.unread}</span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Database size={20} />
            <span>Логи</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} />
            <span>Настройки</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="admin-main">
        <header className="admin-header">
          <h1 className="admin-title">
            {activeTab === 'dashboard' && 'Панель управления'}
            {activeTab === 'users' && 'Управление пользователями'}
            {activeTab === 'feedback' && 'Обращения пользователей'}
            {activeTab === 'logs' && 'Системные логи'}
            {activeTab === 'settings' && 'Настройки системы'}
          </h1>
          <div className="header-actions">
            <button className="header-btn refresh-btn" onClick={handleRefresh}>
              <RefreshCw size={18} />
              <span>Обновить</span>
            </button>
            <button className="header-btn" onClick={handleExport}>
              <Download size={18} />
              <span>Экспорт</span>
            </button>
          </div>
        </header>

        <div className="admin-content">
          {activeTab === 'dashboard' && (
            <>
              {/* Статистика */}
              {loading.stats ? (
                <div className="loading-state">
                  <Loader size={40} className="spinning" />
                  <p>Загрузка статистики...</p>
                </div>
              ) : stats && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon users">
                      <Users size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Всего пользователей</span>
                      <span className="stat-value">{stats.totalUsers}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon active">
                      <Activity size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Активных сегодня</span>
                      <span className="stat-value">{stats.activeUsers}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon resume">
                      <FileText size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Активных резюме</span>
                      <span className="stat-value">{stats.totalResumes}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon ai">
                      <Activity size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">AI-детекций</span>
                      <span className="stat-value">{stats.aiDetections || 0}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon search">
                      <Search size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Проанализировано резюме</span>
                      <span className="stat-value">{stats.totalSearches}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon meeting">
                      <Calendar size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Встреч создано</span>
                      <span className="stat-value">{stats.totalMeetings}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Последние активности */}
              <div className="recent-activities">
                <div className="section-header">
                  <h2 className="section-title">Последние действия</h2>
                  {loading.activities && <Loader size={20} className="spinning" />}
                </div>
                {loading.activities ? (
                  <div className="loading-state small">
                    <p>Загрузка действий...</p>
                  </div>
                ) : (
                  <div className="activities-list">
                    {activities.length > 0 ? (
                      activities.map(activity => (
                        <div key={activity.id} className="activity-item">
                          <div className="activity-info">
                            <div className="activity-user">
                              <div className="user-avatar">
                                {activity.user[0]}
                              </div>
                              <div>
                                <div className="activity-user-name">{activity.user}</div>
                                <div className="activity-desc">
                                  {activity.action}
                                  {activity.target !== '-' && (
                                    <>: <span className="activity-target">{activity.target}</span></>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="activity-meta">
                              <span className="activity-time">
                                <Clock size={12} />
                                {activity.time}
                              </span>
                              <span className={`activity-status ${activity.status}`}>
                                {getStatusIcon(activity.status)}
                                {activity.status === 'completed' && 'Выполнено'}
                                {activity.status === 'pending' && 'В процессе'}
                                {activity.status === 'failed' && 'Ошибка'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state small">
                        <p>Нет действий для отображения</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <div className="users-section">
              <div className="users-header">
                <button className="add-user-btn" onClick={handleOpenAddUserModal}>
                  <UserPlus size={18} />
                  <span>Добавить пользователя</span>
                </button>
              </div>

              {loading.users ? (
                <div className="loading-state">
                  <Loader size={40} className="spinning" />
                  <p>Загрузка пользователей...</p>
                </div>
              ) : (
                <div className="users-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Пользователь</th>
                        <th>Email</th>
                        <th>Роль</th>
                        <th>Статус</th>
                        <th>Последний вход</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length > 0 ? (
                        users.map(user => (
                          <tr key={user.id}>
                            <td>
                              <div className="user-cell">
                                <div className="user-avatar">{user.name[0]}</div>
                                <span>{user.name}</span>
                              </div>
                            </td>
                            <td>{user.email}</td>
                            <td>
                              <span className={`role-badge ${user.role}`}>
                                {user.role === 'admin' ? 'Админ' : 'Пользователь'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${user.status}`}>
                                {user.status === 'active' ? 'Активен' : 'Неактивен'}
                              </span>
                            </td>
                            <td>{formatDate(user.lastActive)}</td>
                            <td>
                              <div className="user-actions">
                                <button 
                                  className="action-icon-btn edit"
                                  onClick={() => handleOpenEditModal(user)}
                                  title="Редактировать пользователя"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  className="action-icon-btn delete"
                                  onClick={() => handleOpenDeleteModal(user)}
                                  title="Удалить пользователя"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="empty-table">
                            Нет пользователей для отображения
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="users-section">
              <div className="users-header">
                <div className="feedback-filters">
                  <button 
                    className={`filter-btn ${feedbackFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setFeedbackFilter('all')}
                  >
                    Все
                    {feedbackStats && <span className="filter-count">{feedbackStats.total}</span>}
                  </button>
                  <button 
                    className={`filter-btn ${feedbackFilter === 'new' ? 'active' : ''}`}
                    onClick={() => setFeedbackFilter('new')}
                  >
                    Новые
                    {feedbackStats && <span className="filter-count new">{feedbackStats.new}</span>}
                  </button>
                  <button 
                    className={`filter-btn ${feedbackFilter === 'in_progress' ? 'active' : ''}`}
                    onClick={() => setFeedbackFilter('in_progress')}
                  >
                    В обработке
                    {feedbackStats && <span className="filter-count progress">{feedbackStats.in_progress}</span>}
                  </button>
                  <button 
                    className={`filter-btn ${feedbackFilter === 'resolved' ? 'active' : ''}`}
                    onClick={() => setFeedbackFilter('resolved')}
                  >
                    Решенные
                    {feedbackStats && <span className="filter-count resolved">{feedbackStats.resolved}</span>}
                  </button>
                </div>
              </div>

              {loading.feedback ? (
                <div className="loading-state">
                  <Loader size={40} className="spinning" />
                  <p>Загрузка обращений...</p>
                </div>
              ) : (
                <div className="users-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Пользователь</th>
                        <th>Email</th>
                        <th>Дата обращения</th>
                        <th>Текст обращения</th>
                        <th>Статус</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredFeedback().length > 0 ? (
                        getFilteredFeedback().map(item => (
                          <tr key={item.id} className={!item.is_read ? 'unread' : ''}>
                            <td>
                              <div className="user-cell">
                                <div className="user-avatar small">
                                  {item.user_name?.[0] || 'Г'}
                                </div>
                                <span>{item.user_name || 'Гость'}</span>
                              </div>
                            </td>
                            <td>{item.user_email || 'Не указан'}</td>
                            <td>{formatDate(item.created_at)}</td>
                            <td className="feedback-message-cell">
                              <div className="feedback-message-preview">
                                {item.message.length > 50 
                                  ? `${item.message.substring(0, 50)}...` 
                                  : item.message}
                              </div>
                            </td>
                            <td>
                              {getFeedbackStatusBadge(item.status)}
                            </td>
                            <td>
                              <div className="user-actions"> {/* Тот же класс, что и для действий с пользователями */}
                                <button 
                                  className="action-icon-btn view"
                                  onClick={() => handleViewFeedback(item)}
                                  title="Просмотреть обращение"
                                >
                                  <Eye size={18} />
                                </button>
                                <select 
                                  className="status-select"
                                  value={item.status}
                                  onChange={(e) => handleUpdateFeedbackStatus(item.id, e.target.value)}
                                  style={{ width: '120px' }}
                                >
                                  <option value="new">Новое</option>
                                  <option value="in_progress">В обработке</option>
                                  <option value="resolved">Решено</option>
                                </select>
                                <button 
                                  className="action-icon-btn delete small"
                                  onClick={() => handleDeleteFeedback(item.id)}
                                  title="Удалить обращение"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="empty-table">
                            Нет обращений для отображения
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="logs-section">
              <div className="logs-header">
                <div className="logs-filter">
                  <Filter size={16} />
                  <span>Фильтр</span>
                </div>
              </div>

              {loading.logs ? (
                <div className="loading-state">
                  <Loader size={40} className="spinning" />
                  <p>Загрузка логов...</p>
                </div>
              ) : (
                <>
                  <div className="logs-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Время</th>
                          <th>Пользователь</th>
                          <th>Действие</th>
                          <th>Цель</th>
                          <th>Статус</th>
                          <th>Детали</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.length > 0 ? (
                          logs.map(log => (
                            <tr key={log.id} className={getLogLevelClass(log.level)}>
                              <td>{formatDate(log.timestamp)}</td>
                              <td>
                                <div className="user-cell small">
                                  <div className="user-avatar small">{log.user_name?.[0] || 'С'}</div>
                                  <span>{log.user_name || 'Система'}</span>
                                </div>
                              </td>
                              <td>{log.action}</td>
                              <td>{log.target || '-'}</td>
                              <td>
                                <span className={`status-badge ${log.error ? 'failed' : 'active'}`}>
                                  {log.error ? 'Ошибка' : 'Успешно'}
                                </span>
                              </td>
                              <td className="log-details">
                                {log.details || log.error || '-'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty-table">
                              Нет логов для отображения
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Пагинация */}
                  {logsPagination.pages > 1 && (
                    <div className="pagination">
                      <button 
                        className="pagination-btn"
                        disabled={logsPagination.page === 1}
                        onClick={() => setLogsPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      >
                        <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                      <span className="pagination-info">
                        {logsPagination.page} из {logsPagination.pages}
                      </span>
                      <button 
                        className="pagination-btn"
                        disabled={logsPagination.page === logsPagination.pages}
                        onClick={() => setLogsPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-placeholder">
              <p>Здесь будут настройки системы и конфигурации</p>
            </div>
          )}
        </div>
      </main>

      {/* Модальное окно добавления пользователя */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={handleCloseAddUserModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Добавление пользователя</h3>
              <button className="modal-close" onClick={handleCloseAddUserModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {createSuccess ? (
                <div className="success-message">
                  <CheckCircle size={48} />
                  <p>{createSuccess}</p>
                </div>
              ) : (
                <>
                  {createError && (
                    <div className="error-message">
                      <AlertCircle size={16} />
                      <span>{createError}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      <User size={16} />
                      <span>Имя пользователя</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      className="form-input"
                      placeholder="Введите имя"
                      value={newUser.name}
                      onChange={handleInputChange}
                      disabled={isCreating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Mail size={16} />
                      <span>Email</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      className="form-input"
                      placeholder="Введите email"
                      value={newUser.email}
                      onChange={handleInputChange}
                      disabled={isCreating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Lock size={16} />
                      <span>Пароль</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      className="form-input"
                      placeholder="Введите пароль"
                      value={newUser.password}
                      onChange={handleInputChange}
                      disabled={isCreating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Briefcase size={16} />
                      <span>Роль</span>
                    </label>
                    <select
                      name="role"
                      className="form-select"
                      value={newUser.role}
                      onChange={handleInputChange}
                      disabled={isCreating}
                    >
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Activity size={16} />
                      <span>Статус</span>
                    </label>
                    <select
                      name="status"
                      className="form-select"
                      value={newUser.status}
                      onChange={handleInputChange}
                      disabled={isCreating}
                    >
                      <option value="active">Активен</option>
                      <option value="inactive">Неактивен</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {!createSuccess && (
                <>
                  <button className="modal-cancel" onClick={handleCloseAddUserModal} disabled={isCreating}>
                    Отмена
                  </button>
                  <button 
                    className="modal-save" 
                    onClick={handleCreateUser}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <>
                        <Loader size={16} className="spinning" />
                        <span>Создание...</span>
                      </>
                    ) : (
                      'Создать пользователя'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования пользователя */}
      {showEditModal && editingUser && (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Редактирование пользователя</h3>
              <button className="modal-close" onClick={handleCloseEditModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {updateSuccess ? (
                <div className="success-message">
                  <CheckCircle size={48} />
                  <p>{updateSuccess}</p>
                </div>
              ) : (
                <>
                  {updateError && (
                    <div className="error-message">
                      <AlertCircle size={16} />
                      <span>{updateError}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      <User size={16} />
                      <span>Имя пользователя</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      className="form-input"
                      placeholder="Введите имя"
                      value={editingUser.name}
                      onChange={handleEditInputChange}
                      disabled={isUpdating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Mail size={16} />
                      <span>Email</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      className="form-input"
                      placeholder="Введите email"
                      value={editingUser.email}
                      onChange={handleEditInputChange}
                      disabled={isUpdating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Lock size={16} />
                      <span>Новый пароль (оставьте пустым, если не хотите менять)</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      className="form-input"
                      placeholder="Введите новый пароль"
                      value={editingUser.password}
                      onChange={handleEditInputChange}
                      disabled={isUpdating}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Briefcase size={16} />
                      <span>Роль</span>
                    </label>
                    <select
                      name="role"
                      className="form-select"
                      value={editingUser.role}
                      onChange={handleEditInputChange}
                      disabled={isUpdating}
                    >
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <Activity size={16} />
                      <span>Статус</span>
                    </label>
                    <select
                      name="status"
                      className="form-select"
                      value={editingUser.status}
                      onChange={handleEditInputChange}
                      disabled={isUpdating}
                    >
                      <option value="active">Активен</option>
                      <option value="inactive">Неактивен</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {!updateSuccess && (
                <>
                  <button className="modal-cancel" onClick={handleCloseEditModal} disabled={isUpdating}>
                    Отмена
                  </button>
                  <button 
                    className="modal-save" 
                    onClick={handleUpdateUser}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <Loader size={16} className="spinning" />
                        <span>Сохранение...</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>Сохранить</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления пользователя */}
      {showDeleteModal && deletingUser && (
        <div className="modal-overlay" onClick={handleCloseDeleteModal}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Подтверждение удаления</h3>
              <button className="modal-close" onClick={handleCloseDeleteModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {deleteError && (
                <div className="error-message">
                  <AlertCircle size={16} />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="delete-confirmation">
                <AlertCircle size={48} className="delete-icon" />
                <p>Вы уверены, что хотите удалить пользователя?</p>
                <div className="user-info">
                  <strong>{deletingUser.name}</strong>
                  <span>{deletingUser.email}</span>
                </div>
                <p className="delete-warning">Это действие нельзя отменить.</p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-cancel" onClick={handleCloseDeleteModal} disabled={isDeleting}>
                Отмена
              </button>
              <button 
                className="modal-delete" 
                onClick={handleDeleteUser}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader size={16} className="spinning" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Удалить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно просмотра обращения */}
      {showFeedbackModal && viewingFeedback && (
        <div className="modal-overlay" onClick={handleCloseFeedbackModal}>
          <div className="modal-content feedback-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Просмотр обращения</h3>
              <button className="modal-close" onClick={handleCloseFeedbackModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="feedback-details">
                <div className="feedback-detail-row">
                  <span className="detail-label">Отправитель:</span>
                  <span className="detail-value">{viewingFeedback.user_name}</span>
                </div>
                <div className="feedback-detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{viewingFeedback.user_email || 'Не указан'}</span>
                </div>
                <div className="feedback-detail-row">
                  <span className="detail-label">Дата:</span>
                  <span className="detail-value">{formatDate(viewingFeedback.created_at)}</span>
                </div>
                <div className="feedback-detail-row">
                  <span className="detail-label">Статус:</span>
                  <div className="detail-value">
                    {getFeedbackStatusBadge(viewingFeedback.status)}
                  </div>
                </div>
                <div className="feedback-detail-row message">
                  <span className="detail-label">Сообщение:</span>
                  <div className="feedback-message-full">
                    {viewingFeedback.message}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <select 
                className="status-select large"
                value={viewingFeedback.status}
                onChange={(e) => {
                  handleUpdateFeedbackStatus(viewingFeedback.id, e.target.value)
                  setViewingFeedback(prev => ({ ...prev, status: e.target.value }))
                }}
              >
                <option value="new">Новое</option>
                <option value="in_progress">В обработке</option>
                <option value="resolved">Решено</option>
              </select>
              <button className="modal-cancel" onClick={handleCloseFeedbackModal}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel