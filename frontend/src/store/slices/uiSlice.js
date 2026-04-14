import { createSlice } from '@reduxjs/toolkit'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    // Состояние выпадающих списков на страницах
    showResumeSelector: {
      checkResume: false,
      findCandidate: false
    },
    // Состояние загрузки
    globalLoading: false,
    // Уведомления
    notification: {
      show: false,
      message: '',
      type: 'info' // 'info', 'success', 'error'
    },
    // Активная страница
    currentPage: null
  },
  reducers: {
    toggleResumeSelector: (state, action) => {
      const page = action.payload
      if (state.showResumeSelector[page] !== undefined) {
        state.showResumeSelector[page] = !state.showResumeSelector[page]
      }
    },
    
    setShowResumeSelector: (state, action) => {
      const { page, value } = action.payload
      if (state.showResumeSelector[page] !== undefined) {
        state.showResumeSelector[page] = value
      }
    },
    
    setGlobalLoading: (state, action) => {
      state.globalLoading = action.payload
    },
    
    showNotification: (state, action) => {
      state.notification = {
        show: true,
        message: action.payload.message,
        type: action.payload.type || 'info'
      }
    },
    
    hideNotification: (state) => {
      state.notification.show = false
    },
    
    setCurrentPage: (state, action) => {
      state.currentPage = action.payload
    },
    
    resetUIState: (state) => {
      state.showResumeSelector = {
        checkResume: false,
        findCandidate: false
      }
      state.globalLoading = false
      state.notification = {
        show: false,
        message: '',
        type: 'info'
      }
    }
  }
})

export const {
  toggleResumeSelector,
  setShowResumeSelector,
  setGlobalLoading,
  showNotification,
  hideNotification,
  setCurrentPage,
  resetUIState
} = uiSlice.actions

// Селекторы
export const selectShowResumeSelector = (state, page) => state.ui.showResumeSelector[page]
export const selectGlobalLoading = (state) => state.ui.globalLoading
export const selectNotification = (state) => state.ui.notification
export const selectCurrentPage = (state) => state.ui.currentPage

export default uiSlice.reducer