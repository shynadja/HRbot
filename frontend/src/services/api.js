import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

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
  logAction: async (action, userId) => {
    try {
      const response = await axios.post(`${API_URL}/action`, {
        action,
        user_id: userId,
        data: {}
      })
      return response.data
    } catch (error) {
      console.error('Error logging action:', error)
      throw error
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
      const response = await axios.post(`${API_URL}/cold-search1`, {
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
  }
}