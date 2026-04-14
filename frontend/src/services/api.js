import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Кэш персональных данных на клиенте
const personalDataCache = new Map()

/**
 * Сохранение персональных данных в кэш клиента
 */
export const cachePersonalData = (candidateUuid, data) => {
  personalDataCache.set(candidateUuid, {
    first_name: data.first_name,
    last_name: data.last_name,
    full_name: data.full_name,
    email: data.email,
    phone: data.phone
  })
}

/**
 * Получение всех закэшированных персональных данных
 */
export const getPersonalDataCache = () => {
  const cache = {}
  personalDataCache.forEach((value, key) => {
    cache[key] = value
  })
  return cache
}

/**
 * Очистка кэша персональных данных
 */
export const clearPersonalDataCache = () => {
  personalDataCache.clear()
}

export const api = {
  // ========== Аутентификация ==========
  
  /**
   * Вход в систему
   */
  login: async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password })
      return response.data
    } catch (error) {
      console.error('Login error:', error)
      throw new Error(error.response?.data?.error || 'Ошибка при входе в систему')
    }
  },

  // ========== Health Check ==========
  
  /**
   * Проверка состояния сервера и AI сервисов
   */
  healthCheck: async () => {
    try {
      const response = await axios.get(`${API_URL}/health`)
      return response.data
    } catch (error) {
      console.error('Health check error:', error)
      return { status: 'error', services: { node: 'unknown', ai_services: 'unknown' } }
    }
  },

  // ========== AI Сервисы (прокси) ==========
  
  /**
   * Оценка кандидата через Single Agent
   */
  evaluateCandidate: async (candidateData) => {
    try {
      const response = await axios.post(`${API_URL}/ai/evaluate`, candidateData)
      return response.data
    } catch (error) {
      console.error('Error evaluating candidate:', error)
      throw error
    }
  },

  /**
   * Пакетная оценка кандидатов
   */
  evaluateBatch: async (candidates) => {
    try {
      const response = await axios.post(`${API_URL}/ai/evaluate/batch`, { candidates })
      return response.data
    } catch (error) {
      console.error('Error in batch evaluation:', error)
      throw error
    }
  },

  /**
   * Детекция ИИ в тексте
   */
  detectAI: async (text, promptKey = 'check_ai_generated') => {
    try {
      const response = await axios.post(`${API_URL}/ai/detect-ai`, { text, prompt_key: promptKey })
      return response.data
    } catch (error) {
      console.error('Error detecting AI:', error)
      throw error
    }
  },

  /**
   * Поиск преувеличений в тексте
   */
  findExaggerations: async (text) => {
    try {
      const response = await axios.post(`${API_URL}/ai/find-exaggerations`, { 
        text, 
        prompt_key: 'find_exaggerations' 
      })
      return response.data
    } catch (error) {
      console.error('Error finding exaggerations:', error)
      throw error
    }
  },

  /**
   * Создание события в календаре
   */
  createCalendarEvent: async (eventData) => {
    try {
      console.log('Sending calendar event request:', eventData)
      
      const response = await axios.post(`${API_URL}/ai/calendar/create`, eventData, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      return response.data
    } catch (error) {
      console.error('Error creating calendar event:', error)
      if (error.response) {
        console.error('Response error data:', error.response.data)
        console.error('Response error status:', error.response.status)
      }
      throw error
    }
  },

  /**
   * Проверка состояния AI сервисов
   */
  aiHealthCheck: async () => {
    try {
      const response = await axios.get(`${API_URL}/ai/health`)
      return response.data
    } catch (error) {
      console.error('AI health check error:', error)
      return { status: 'unavailable' }
    }
  },

  /**
   * Получение статистики AI сервисов
   */
  getAIStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/ai/stats`)
      return response.data
    } catch (error) {
      console.error('Error getting AI stats:', error)
      return null
    }
  },

  /**
   * Получение статистики использования токенов
   */
  getTokenStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/ai/stats/tokens`)
      return response.data
    } catch (error) {
      console.error('Error getting token stats:', error)
      return null
    }
  },

  // ========== Логирование ==========
  
  /**
   * Логирование действия пользователя
   */
  logAction: async (logData) => {
    try {
      const response = await axios.post(`${API_URL}/log`, logData)
      return response.data
    } catch (error) {
      console.error('Error logging action:', error)
      return { success: false }
    }
  },

  // ========== Резюме ==========

  /**
   * Загрузка резюме на сервер
   */
  uploadResume: async (file, userData, personalData = null) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fileName', file.name)
    formData.append('userId', userData?.id || 'anonymous')
    formData.append('userName', userData?.name || '')
    
    if (personalData) {
      formData.append('personalData', JSON.stringify(personalData))
    }
    
    try {
      const response = await axios.post(`${API_URL}/resumes/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          console.log(`Upload progress: ${percentCompleted}%`)
        }
      })
      
      // Кэшируем персональные данные если есть
      if (response.data.candidate?.email && personalData) {
        const cacheKey = `${response.data.candidate.first_name}_${response.data.candidate.last_name}_${response.data.id}`
        cachePersonalData(cacheKey, {
          first_name: response.data.candidate.first_name,
          last_name: response.data.candidate.last_name,
          full_name: response.data.candidate.full_name,
          email: response.data.candidate.email,
          phone: response.data.candidate.phone
        })
      }
      
      return response.data
    } catch (error) {
      console.error('Error uploading resume:', error)
      throw error
    }
  },

  /**
   * Получение списка всех резюме для пользователя
   */
  getResumes: async (userId) => {
    try {
      const params = userId ? { userId } : {}
      const response = await axios.get(`${API_URL}/resumes`, { params })
      return response.data
    } catch (error) {
      console.error('Error fetching resumes:', error)
      throw error
    }
  },

  /**
   * Получение всех резюме (включая удаленные) - для админа
   */
  getAllResumes: async () => {
    try {
      const response = await axios.get(`${API_URL}/resumes/all`)
      return response.data
    } catch (error) {
      console.error('Error fetching all resumes:', error)
      throw error
    }
  },

  /**
   * Получение конкретного резюме по ID
   */
  getResumeById: async (resumeId) => {
    try {
      const response = await axios.get(`${API_URL}/resumes/${resumeId}`)
      return response.data
    } catch (error) {
      console.error('Error fetching resume:', error)
      throw error
    }
  },

  /**
   * Просмотр файла резюме
   */
  viewResume: (resumeId) => {
    return `${API_URL}/resumes/${resumeId}/view`
  },

  /**
   * Мягкое удаление резюме (помечается как удаленное)
   */
  deleteResume: async (resumeId) => {
    try {
      const response = await axios.delete(`${API_URL}/resumes/${resumeId}`)
      return response.data
    } catch (error) {
      console.error('Error deleting resume:', error)
      throw error
    }
  },

  /**
   * Полное удаление резюме (для админа)
   */
  permanentDeleteResume: async (resumeId) => {
    try {
      const response = await axios.delete(`${API_URL}/resumes/${resumeId}/permanent`)
      return response.data
    } catch (error) {
      console.error('Error permanently deleting resume:', error)
      throw error
    }
  },

  /**
   * Восстановление удаленного резюме (для админа)
   */
  restoreResume: async (resumeId) => {
    try {
      const response = await axios.post(`${API_URL}/resumes/${resumeId}/restore`)
      return response.data
    } catch (error) {
      console.error('Error restoring resume:', error)
      throw error
    }
  },

  /**
   * Анализ резюме на ИИ и преувеличения
   */
  analyzeResume: async (resumeId) => {
    try {
      const response = await axios.post(`${API_URL}/resumes/${resumeId}/analyze`)
      return response.data
    } catch (error) {
      console.error('Error analyzing resume:', error)
      throw error
    }
  },

  // ========== Поиск кандидатов ==========

  /**
   * Поиск кандидатов по резюме с AI-анализом
   */
  searchCandidates: async (query, resumeIds, userId = null) => {
    try {
      const response = await axios.post(`${API_URL}/candidates/search`, {
        query,
        resume_ids: resumeIds,
        userId,
        personal_data_cache: getPersonalDataCache()
      })
      return response.data
    } catch (error) {
      console.error('Error searching candidates:', error)
      throw error
    }
  },

  // ========== Обратная связь ==========

  /**
   * Отправка обратной связи
   */
  sendFeedback: async (feedbackData) => {
    try {
      const response = await axios.post(`${API_URL}/feedback`, feedbackData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionStorage.getItem('sessionId') || null
        }
      })
      return response.data
    } catch (error) {
      console.error('Error sending feedback:', error)
      throw error
    }
  },

  // ========== Админ-панель ==========

  /**
   * Получение статистики для админ-панели
   */
  getAdminStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/stats`)
      return response.data
    } catch (error) {
      console.error('Error getting admin stats:', error)
      throw error
    }
  },

  /**
   * Получение списка пользователей для админ-панели
   */
  getAdminUsers: async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/users`)
      return response.data
    } catch (error) {
      console.error('Error getting admin users:', error)
      throw error
    }
  },

  /**
   * Получение последних действий для админ-панели
   */
  getRecentActivities: async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/recent-activities`)
      return response.data
    } catch (error) {
      console.error('Error getting recent activities:', error)
      throw error
    }
  },

  /**
   * Получение всех обращений пользователей
   */
  getAllFeedback: async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/feedback`)
      return response.data
    } catch (error) {
      console.error('Error getting all feedback:', error)
      throw error
    }
  },

  /**
   * Обновление статуса обращения
   */
  updateFeedbackStatus: async (feedbackId, status, adminId, adminName) => {
    try {
      const response = await axios.put(`${API_URL}/admin/feedback/${feedbackId}/status`, {
        status,
        admin_id: adminId,
        admin_name: adminName
      })
      return response.data
    } catch (error) {
      console.error('Error updating feedback status:', error)
      throw error
    }
  },

  // ========== Встречи ==========

  /**
   * Получение встреч пользователя
   */
  getMeetings: async (userId) => {
    try {
      const response = await axios.get(`${API_URL}/meetings`, { params: { userId } })
      return response.data
    } catch (error) {
      console.error('Error getting meetings:', error)
      throw error
    }
  },

  /**
   * Создание встречи
   */
  createMeeting: async (meetingData) => {
    try {
      const response = await axios.post(`${API_URL}/meetings`, meetingData)
      return response.data
    } catch (error) {
      console.error('Error creating meeting:', error)
      throw error
    }
  },

  /**
   * Обновление статуса встречи
   */
  updateMeetingStatus: async (meetingId, status, notes = null) => {
    try {
      const response = await axios.put(`${API_URL}/meetings/${meetingId}/status`, {
        status,
        notes
      })
      return response.data
    } catch (error) {
      console.error('Error updating meeting status:', error)
      throw error
    }
  },

  // ========== Устаревшие методы (заглушки для совместимости) ==========
  
  getUser: async (userId) => {
    console.warn('getUser is deprecated, use auth context instead')
    return { id: userId, name: 'User' }
  },
  
  getStats: async () => {
    console.warn('getStats is deprecated, use getAdminStats instead')
    const stats = await api.getAdminStats()
    return stats
  },
  
  coldSearch: async () => {
    console.warn('coldSearch is deprecated, use searchCandidates with resume_ids instead')
    return { total_found: 0, candidates: [] }
  },
  
  getSearchResults: async () => {
    console.warn('getSearchResults is deprecated')
    return { candidates: [] }
  },
  
  getCandidateAnalysis: async (candidateId) => {
    console.warn('getCandidateAnalysis is deprecated, use analyzeResume instead')
    return api.analyzeResume(candidateId)
  },
  
  getCacheStats: async () => {
    console.warn('getCacheStats is deprecated')
    return { hits: 0, misses: 0 }
  },
  
  analyzeMultipleResumes: async (resumeIds) => {
    console.warn('analyzeMultipleResumes is deprecated, analyze individually')
    const results = []
    for (const id of resumeIds) {
      try {
        const result = await api.analyzeResume(id)
        results.push(result)
      } catch (e) {
        results.push({ error: e.message, id })
      }
    }
    return { results }
  },
  
  updateCandidateInfo: async () => {
    console.warn('updateCandidateInfo is not implemented')
    return { success: false, message: 'Not implemented' }
  },
  
  getResumeStats: async () => {
    console.warn('getResumeStats is deprecated, use getAdminStats instead')
    return api.getAdminStats()
  },
  
  exportResume: async () => {
    console.warn('exportResume is not implemented')
    return null
  },
  
  compareResumes: async () => {
    console.warn('compareResumes is not implemented')
    return { comparison: [] }
  },
  
  getUserFeedback: async () => {
    console.warn('getUserFeedback is not implemented')
    return { feedback: [] }
  },
  
  getSystemLogs: async (page = 1, limit = 20) => {
    console.warn('getSystemLogs is not implemented')
    return { logs: [], pagination: { total: 0, page, limit, pages: 0 } }
  },
  
  createUser: async () => {
    console.warn('createUser is not implemented in Node.js server')
    return { success: false, message: 'Not implemented' }
  },
  
  updateUser: async () => {
    console.warn('updateUser is not implemented in Node.js server')
    return { success: false, message: 'Not implemented' }
  },
  
  deleteUser: async () => {
    console.warn('deleteUser is not implemented in Node.js server')
    return { success: false, message: 'Not implemented' }
  },
  
  permanentDeleteUser: async () => {
    console.warn('permanentDeleteUser is not implemented in Node.js server')
    return { success: false, message: 'Not implemented' }
  },
  
  getFeedbackStats: async () => {
    console.warn('getFeedbackStats is not implemented')
    return { total: 0, new: 0, in_progress: 0, resolved: 0 }
  },
  
  markFeedbackAsRead: async () => {
    console.warn('markFeedbackAsRead is not implemented')
    return { success: false }
  },
  
  deleteFeedback: async () => {
    console.warn('deleteFeedback is not implemented')
    return { success: false }
  },
}

// Экспортируем часто используемые функции отдельно
export const {
  login,
  healthCheck,
  evaluateCandidate,
  evaluateBatch,
  detectAI,
  findExaggerations,
  createCalendarEvent,
  aiHealthCheck,
  getAIStats,
  getTokenStats,
  logAction,
  uploadResume,
  getResumes,
  getAllResumes,
  getResumeById,
  viewResume,
  deleteResume,
  permanentDeleteResume,
  restoreResume,
  analyzeResume,
  searchCandidates,
  sendFeedback,
  getAdminStats,
  getAdminUsers,
  getRecentActivities,
  getAllFeedback,
  updateFeedbackStatus,
  getMeetings,
  getMeetingById,
  getCandidateMeetings,
  createMeeting,
  updateMeetingStatus,
  deleteMeeting,
  getMeetingsStats,
} = api

export default api