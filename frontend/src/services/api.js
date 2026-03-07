import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL

export const api = {
  // Получение данных пользователя
  getUser: async (userId) => {
    try {
      const response = await axios.get(`${API_URL}/user/${userId}`)
      return response.data
    } catch (error) {
      console.error('Error getting user:', error)
      throw error
    }
  },
  
  // Логирование действия
  /**
   * Логирование действия пользователя
   * @param {Object} logData - данные для логирования
   * @returns {Promise} - промис с результатом
   */
  logAction: async (logData) => {
    try {
      const response = await axios.post(`${API_URL}/log`, logData)
      return response.data
    } catch (error) {
      console.error('Error logging action:', error)
      // Не бросаем ошибку, чтобы не прерывать основной поток
      return { success: false }
    }
  },
  
  // Получение статистики
  getStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/stats`)
      return response.data
    } catch (error) {
      console.error('Error getting stats:', error)
      throw error
    }
  },

  // Холодный поиск кандидатов
  coldSearch: async (query, userId = 'anonymous', limit = 10) => {
    try {
      const response = await axios.post(`${API_URL}/search`, {
        query,
        user_id: userId,
        limit
      })
      return response.data
    } catch (error) {
      console.error('Error in cold search:', error)
      throw error
    }
  },

  // Получение результатов сохраненного поиска
  getSearchResults: async (queryId, includeAll = false) => {
    try {
      const response = await axios.get(`${API_URL}/search/${queryId}/results`, {
        params: { include_all: includeAll }
      })
      return response.data
    } catch (error) {
      console.error('Error getting search results:', error)
      throw error
    }
  },

  // Получение анализа кандидата
  getCandidateAnalysis: async (candidateId, query) => {
    try {
      const response = await axios.get(`${API_URL}/candidate/${candidateId}/analysis`, {
        params: { query }
      })
      return response.data
    } catch (error) {
      console.error('Error getting candidate analysis:', error)
      throw error
    }
  },

  // Статистика кеша
  getCacheStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/cache/stats`)
      return response.data
    } catch (error) {
      console.error('Error getting cache stats:', error)
      throw error
    }
  },

  /**
   * Загрузка резюме на сервер
   * @param {File} file - файл резюме
   * @param {Object} userData - данные пользователя
   * @returns {Promise} - промис с результатом загрузки
   */
  uploadResume: async (file, userData) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fileName', file.name)
    formData.append('userId', userData?.id || 'anonymous')
    formData.append('userName', userData?.name || '')
    
    try {
      const response = await axios.post(`${API_URL}/resumes/upload`, formData, {
        headers: {
          // 'Accept': 'application/json',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          console.log(`Upload progress: ${percentCompleted}%`)
        }
      })
      return response.data
    } catch (error) {
      console.error('Error uploading resume:', error)
      throw error
    }
  },

  /**
   * Получение списка всех резюме для пользователя
   * @param {string} userId - ID пользователя
   * @returns {Promise} - промис со списком резюме
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
   * @returns {Promise} - промис со списком всех резюме
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
   * @param {number|string} resumeId - ID резюме
   * @returns {Promise} - промис с данными резюме
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
   * Мягкое удаление резюме (помечается как удаленное)
   * @param {number|string} resumeId - ID резюме
   * @returns {Promise} - промис с результатом удаления
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
   * @param {number|string} resumeId - ID резюме
   * @returns {Promise} - промис с результатом удаления
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
   * @param {number|string} resumeId - ID резюме
   * @returns {Promise} - промис с результатом восстановления
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
   * Анализ резюме
   * @param {number|string} resumeId - ID резюме
   * @param {Object} options - опции анализа
   * @returns {Promise} - промис с результатами анализа
   */
  analyzeResume: async (resumeId, options = {}) => {
    try {
      const response = await axios.post(`${API_URL}/resumes/${resumeId}/analyze`, options)
      return response.data
    } catch (error) {
      console.error('Error analyzing resume:', error)
      throw error
    }
  },

  /**
   * Пакетный анализ нескольких резюме
   * @param {Array} resumeIds - массив ID резюме
   * @returns {Promise} - промис с результатами анализа
   */
  analyzeMultipleResumes: async (resumeIds) => {
    try {
      const response = await axios.post(`${API_URL}/resumes/analyze-batch`, { resume_ids: resumeIds })
      return response.data
    } catch (error) {
      console.error('Error analyzing multiple resumes:', error)
      throw error
    }
  },

  /**
   * Поиск кандидатов по резюме
   * @param {string} query - поисковый запрос
   * @param {Array} resumeIds - массив ID резюме для поиска
   * @returns {Promise} - промис с результатами поиска
   */
  searchCandidates: async (query, resumeIds) => {
    try {
      const response = await axios.post(`${API_URL}/candidates/search`, {
        query,
        resume_ids: resumeIds,
        limit: 20
      })
      return response.data
    } catch (error) {
      console.error('Error searching candidates:', error)
      throw error
    }
  },

  /**
   * Обновление информации о кандидате из резюме
   * @param {number|string} resumeId - ID резюме
   * @param {Object} candidateData - обновленные данные кандидата
   * @returns {Promise} - промис с результатом обновления
   */
  updateCandidateInfo: async (resumeId, candidateData) => {
    try {
      const response = await axios.put(`${API_URL}/resumes/${resumeId}/candidate`, candidateData)
      return response.data
    } catch (error) {
      console.error('Error updating candidate info:', error)
      throw error
    }
  },

  /**
   * Получение статистики по резюме
   * @returns {Promise} - промис со статистикой
   */
  getResumeStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/resumes/stats`)
      return response.data
    } catch (error) {
      console.error('Error getting resume stats:', error)
      throw error
    }
  },

  /**
   * Экспорт резюме в различных форматах
   * @param {number|string} resumeId - ID резюме
   * @param {string} format - формат экспорта (pdf, docx, txt)
   * @returns {Promise} - промис с blob данными файла
   */
  exportResume: async (resumeId, format = 'pdf') => {
    try {
      const response = await axios.get(`${API_URL}/resumes/${resumeId}/export`, {
        params: { format },
        responseType: 'blob'
      })
      return response.data
    } catch (error) {
      console.error('Error exporting resume:', error)
      throw error
    }
  },

  /**
   * Сравнение нескольких резюме
   * @param {Array} resumeIds - массив ID резюме для сравнения
   * @returns {Promise} - промис с результатами сравнения
   */
  compareResumes: async (resumeIds) => {
    try {
      const response = await axios.post(`${API_URL}/resumes/compare`, { resume_ids: resumeIds })
      return response.data
    } catch (error) {
      console.error('Error comparing resumes:', error)
      throw error
    }
  },

  /**
   * Отправка обратной связи
   * @param {Object} feedbackData - данные обратной связи
   * @param {string} feedbackData.message - сообщение
   * @param {string} feedbackData.userId - ID пользователя
   * @param {string} feedbackData.userName - имя пользователя
   * @param {string} feedbackData.userEmail - email пользователя
   * @param {string} feedbackData.userRole - роль пользователя
   * @returns {Promise} - промис с результатом отправки
   */
  sendFeedback: async (feedbackData) => {
    try {
      const response = await axios.post(`${API_URL}/feedback`, feedbackData, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      return response.data
    } catch (error) {
      console.error('Error sending feedback:', error)
      throw error
    }
  },

  /**
   * Получение сообщений обратной связи пользователя
   * @param {string} userId - ID пользователя
   * @returns {Promise} - промис со списком сообщений пользователя
   */
  getUserFeedback: async (userId) => {
    try {
      const response = await axios.get(`${API_URL}/feedback/user/${userId}`)
      return response.data
    } catch (error) {
      console.error('Error getting user feedback:', error)
      throw error
    }
  },

  /**
   * Получение статистики для админ-панели
   * @returns {Promise} - промис со статистикой
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
   * @returns {Promise} - промис со списком пользователей
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
   * @returns {Promise} - промис с последними действиями
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
   * Получение системных логов
   * @param {number} page - номер страницы
   * @param {number} limit - количество записей на странице
   * @returns {Promise} - промис с логами
   */
  getSystemLogs: async (page = 1, limit = 20) => {
    try {
      const response = await axios.get(`${API_URL}/admin/logs`, {
        params: { page, limit }
      })
      return response.data
    } catch (error) {
      console.error('Error getting system logs:', error)
      throw error
    }
  },

  /**
   * Создание нового пользователя
   * @param {Object} userData - данные пользователя
   * @param {string} userData.name - имя пользователя
   * @param {string} userData.email - email
   * @param {string} userData.password - пароль
   * @param {string} userData.role - роль (user/admin)
   * @param {string} userData.status - статус (active/inactive)
   * @param {string} adminId - ID администратора (для логирования)
   * @param {string} adminName - имя администратора (для логирования)
   * @returns {Promise} - промис с результатом
   */
  createUser: async (userData, adminId, adminName) => {
    try {
      const response = await axios.post(`${API_URL}/admin/users`, {
        ...userData,
        admin_id: adminId,
        admin_name: adminName
      })
      return response.data
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  },

  /**
   * Обновление пользователя
   * @param {number} userId - ID пользователя
   * @param {Object} userData - данные для обновления
   * @param {string} adminId - ID администратора
   * @param {string} adminName - имя администратора
   * @returns {Promise} - промис с результатом
   */
  updateUser: async (userId, userData, adminId, adminName) => {
    try {
      const response = await axios.put(`${API_URL}/admin/users/${userId}`, {
        ...userData,
        admin_id: adminId,
        admin_name: adminName
      })
      return response.data
    } catch (error) {
      console.error('Error updating user:', error)
      throw error
    }
  },

  /**
   * Мягкое удаление пользователя (деактивация)
   * @param {number} userId - ID пользователя
   * @param {string} adminId - ID администратора
   * @param {string} adminName - имя администратора
   * @returns {Promise} - промис с результатом
   */
  deleteUser: async (userId, adminId, adminName) => {
    try {
      const response = await axios.delete(`${API_URL}/admin/users/${userId}`, {
        data: {
          admin_id: adminId,
          admin_name: adminName
        }
      })
      return response.data
    } catch (error) {
      console.error('Error deleting user:', error)
      throw error
    }
  },

  /**
   * Полное удаление пользователя
   * @param {number} userId - ID пользователя
   * @param {string} adminId - ID администратора
   * @param {string} adminName - имя администратора
   * @returns {Promise} - промис с результатом
   */
  permanentDeleteUser: async (userId, adminId, adminName) => {
    try {
      const response = await axios.delete(`${API_URL}/admin/users/${userId}/permanent`, {
        data: {
          admin_id: adminId,
          admin_name: adminName
        }
      })
      return response.data
    } catch (error) {
      console.error('Error permanently deleting user:', error)
      throw error
    }
  },

  /**
 * Получение всех обращений пользователей
 * @returns {Promise} - промис со списком обращений
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
 * Получение статистики по обращениям
 * @returns {Promise} - промис со статистикой
 */
getFeedbackStats: async () => {
  try {
    const response = await axios.get(`${API_URL}/admin/feedback/stats`)
    return response.data
  } catch (error) {
    console.error('Error getting feedback stats:', error)
    throw error
  }
},

/**
 * Обновление статуса обращения
 * @param {number} feedbackId - ID обращения
 * @param {string} status - новый статус
 * @param {string} adminId - ID администратора
 * @param {string} adminName - имя администратора
 * @returns {Promise} - промис с результатом
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

/**
 * Отметить обращение как прочитанное
 * @param {number} feedbackId - ID обращения
 * @returns {Promise} - промис с результатом
 */
markFeedbackAsRead: async (feedbackId) => {
  try {
    const response = await axios.put(`${API_URL}/admin/feedback/${feedbackId}/read`)
    return response.data
  } catch (error) {
    console.error('Error marking feedback as read:', error)
    throw error
  }
},

/**
 * Удаление обращения
 * @param {number} feedbackId - ID обращения
 * @param {string} adminId - ID администратора
 * @param {string} adminName - имя администратора
 * @returns {Promise} - промис с результатом
 */
deleteFeedback: async (feedbackId, adminId, adminName) => {
  try {
    const response = await axios.delete(`${API_URL}/admin/feedback/${feedbackId}`, {
      data: {
        admin_id: adminId,
        admin_name: adminName
      }
    })
    return response.data
  } catch (error) {
    console.error('Error deleting feedback:', error)
    throw error
  }
},
}

// Экспортируем также отдельные функции для удобства
export const {
  getUser,
  logAction,
  getStats,
  coldSearch,
  getSearchResults,
  getCandidateAnalysis,
  getCacheStats,
  uploadResume,
  getResumes,
  getAllResumes,
  getResumeById,
  deleteResume,
  permanentDeleteResume,
  restoreResume,
  analyzeResume,
  analyzeMultipleResumes,
  searchCandidates,
  updateCandidateInfo,
  getResumeStats,
  exportResume,
  compareResumes,
  sendFeedback,
  getUserFeedback,
  getAdminStats,
  getAdminUsers,
  getRecentActivities,
  getSystemLogs,
  getAllFeedback,
  getFeedbackStats,
  updateFeedbackStatus,
  markFeedbackAsRead,
  deleteFeedback
} = api