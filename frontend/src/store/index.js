import { configureStore } from '@reduxjs/toolkit'
import resumeReducer from './slices/resumeSlice'
import searchReducer from './slices/searchSlice'
import uiReducer from './slices/uiSlice'

// Загрузка состояния из localStorage
const loadState = () => {
  try {
    const serializedState = localStorage.getItem('talkpro_redux_state')
    if (serializedState === null) {
      return undefined
    }
    const state = JSON.parse(serializedState)
    // Очищаем дубликаты в resumes.items
    if (state.resumes?.items) {
      const seen = new Set()
      state.resumes.items = state.resumes.items.filter(item => {
        if (seen.has(item.id)) {
          return false
        }
        seen.add(item.id)
        return true
      })
    }
    
    // Очищаем дубликаты в analysisResults
    if (state.resumes?.analysisResults) {
      const seen = new Set()
      state.resumes.analysisResults = state.resumes.analysisResults.filter(item => {
        if (seen.has(item.id)) {
          return false
        }
        seen.add(item.id)
        return true
      })
    }
    
    return state
  } catch (err) {
    console.error('Error loading state from localStorage:', err)
    return undefined
  }
}

// Сохранение состояния в localStorage
const saveState = (state) => {
  try {
    const stateToPersist = {
      resumes: {
        items: state.resumes.items,
        selectedResumes: state.resumes.selectedResumes,
        analysisResults: state.resumes.analysisResults,
        lastUpdated: state.resumes.lastUpdated
      },
      search: {
        query: state.search.query,
        results: state.search.results,
        totalFound: state.search.totalFound,
        aiUsed: state.search.aiUsed,
        lastSearch: state.search.lastSearch
      },
      ui: {
        showResumeSelector: state.ui.showResumeSelector,
        currentPage: state.ui.currentPage
      }
    }
    const serializedState = JSON.stringify(stateToPersist)
    localStorage.setItem('talkpro_redux_state', serializedState)
  } catch (err) {
    console.error('Error saving state to localStorage:', err)
  }
}

const preloadedState = loadState()

export const store = configureStore({
  reducer: {
    resumes: resumeReducer,
    search: searchReducer,
    ui: uiReducer
  },
  preloadedState,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Игнорируем некоторые пути для сериализации
        ignoredActions: [
          'resumes/fetchResumes/fulfilled',
          'search/searchCandidates/fulfilled'
        ],
        ignoredPaths: ['resumes.items', 'search.results']
      }
    })
})

// Подписываемся на изменения store для сохранения в localStorage
store.subscribe(() => {
  saveState(store.getState())
})

export default store