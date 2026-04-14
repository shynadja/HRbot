import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../services/api'
import { getPersonalData } from '../../utils/personalDataCache'

// Асинхронный thunk для загрузки резюме
export const fetchResumes = createAsyncThunk(
  'resumes/fetchResumes',
  async (userId, { rejectWithValue }) => {
    try {
      const data = await api.getResumes(userId)
      const enrichedResumes = (data.resumes || []).map(resume => {
        const personalData = getPersonalData(resume.candidate_uuid)
        return {
          ...resume,
          full_name: personalData?.full_name || resume.full_name || 'Имя не указано',
          first_name: personalData?.first_name || resume.first_name || '',
          last_name: personalData?.last_name || resume.last_name || ''
        }
      })
      return enrichedResumes
    } catch (error) {
      return rejectWithValue(error.message || 'Не удалось загрузить резюме')
    }
  }
)

// Асинхронный thunk для удаления резюме
export const deleteResumeAsync = createAsyncThunk(
  'resumes/deleteResume',
  async (resumeId, { rejectWithValue }) => {
    try {
      await api.deleteResume(resumeId)
      return resumeId
    } catch (error) {
      return rejectWithValue(error.message || 'Не удалось удалить резюме')
    }
  }
)

// Асинхронный thunk для анализа резюме
export const analyzeResumeAsync = createAsyncThunk(
  'resumes/analyzeResume',
  async (resumeId, { rejectWithValue }) => {
    try {
      const analysis = await api.analyzeResume(resumeId)
      return { resumeId, analysis }
    } catch (error) {
      return rejectWithValue(error.message || 'Не удалось проанализировать резюме')
    }
  }
)

const resumeSlice = createSlice({
  name: 'resumes',
  initialState: {
    items: [],
    selectedResumes: [],
    analysisResults: [],
    isLoading: false,
    isAnalyzing: false,
    error: null,
    lastUpdated: null
  },
  reducers: {
    // Выбор/снятие выбора с резюме
    toggleResumeSelection: (state, action) => {
      const resumeId = action.payload
      const index = state.selectedResumes.indexOf(resumeId)
      if (index === -1) {
        state.selectedResumes.push(resumeId)
      } else {
        state.selectedResumes.splice(index, 1)
      }
    },
    
    // Выбрать все резюме
    selectAllResumes: (state) => {
      state.selectedResumes = state.items.map(r => r.id)
    },
    
    // Снять выбор со всех резюме
    clearSelectedResumes: (state) => {
      state.selectedResumes = []
    },
    
    // Установить выбранные резюме
    setSelectedResumes: (state, action) => {
      state.selectedResumes = action.payload
    },
    
    // Добавить результат анализа
    addAnalysisResult: (state, action) => {
      const { resumeId, result } = action.payload
      const existingIndex = state.analysisResults.findIndex(r => r.id === resumeId)
      if (existingIndex !== -1) {
        state.analysisResults[existingIndex] = { id: resumeId, ...result }
      } else {
        state.analysisResults.push({ id: resumeId, ...result })
      }
    },
    
    // Очистить результаты анализа
    clearAnalysisResults: (state) => {
      state.analysisResults = []
    },
    
    // Установить все результаты анализа
    setAnalysisResults: (state, action) => {
      state.analysisResults = action.payload
    },
    
    // Обновить данные конкретного резюме
    updateResume: (state, action) => {
      const { id, updates } = action.payload
      const index = state.items.findIndex(r => r.id === id)
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...updates }
      }
    },
    
    // Очистить ошибку
    clearError: (state) => {
      state.error = null
    },
    
    // Сбросить состояние
    resetResumeState: (state) => {
      state.selectedResumes = []
      state.analysisResults = []
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Загрузка резюме
      .addCase(fetchResumes.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchResumes.fulfilled, (state, action) => {
        state.isLoading = false
        // Используем Set для удаления дубликатов
        const seen = new Set()
        state.items = (action.payload || []).filter(item => {
          if (seen.has(item.id)) {
            return false
          }
          seen.add(item.id)
          return true
        })
        state.lastUpdated = new Date().toISOString()
      })
      .addCase(fetchResumes.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })
      
      // Удаление резюме
      .addCase(deleteResumeAsync.pending, (state) => {
        state.isLoading = true
      })
      .addCase(deleteResumeAsync.fulfilled, (state, action) => {
        state.isLoading = false
        const resumeId = action.payload
        state.items = state.items.filter(r => r.id !== resumeId)
        state.selectedResumes = state.selectedResumes.filter(id => id !== resumeId)
        state.analysisResults = state.analysisResults.filter(r => r.id !== resumeId)
        state.lastUpdated = new Date().toISOString()
      })
      .addCase(deleteResumeAsync.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })
      
      // Анализ резюме
      .addCase(analyzeResumeAsync.pending, (state) => {
        state.isAnalyzing = true
        state.error = null
      })
      .addCase(analyzeResumeAsync.fulfilled, (state, action) => {
        state.isAnalyzing = false
        const { resumeId, analysis } = action.payload
        const resume = state.items.find(r => r.id === resumeId)
        const result = {
          id: resumeId,
          name: resume?.name || '',
          file_name: resume?.file_name || '',
          full_name: resume?.full_name || '',
          first_name: resume?.first_name || '',
          last_name: resume?.last_name || '',
          position: resume?.position || 'Должность не указана',
          experience: resume?.experience || 'Опыт не указан',
          skills: resume?.skills || [],
          aiProbability: analysis.aiProbability || 0,
          suspiciousPhrases: analysis.suspiciousPhrases || []
        }
        
        const existingIndex = state.analysisResults.findIndex(r => r.id === resumeId)
        if (existingIndex !== -1) {
          state.analysisResults[existingIndex] = result
        } else {
          state.analysisResults.push(result)
        }
        
        // Обновляем анализ в самом резюме
        const itemIndex = state.items.findIndex(r => r.id === resumeId)
        if (itemIndex !== -1) {
          state.items[itemIndex] = {
            ...state.items[itemIndex],
            analysis: {
              ...state.items[itemIndex].analysis,
              aiProbability: analysis.aiProbability,
              suspiciousPhrases: analysis.suspiciousPhrases
            }
          }
        }
      })
      .addCase(analyzeResumeAsync.rejected, (state, action) => {
        state.isAnalyzing = false
        state.error = action.payload
      })
  }
})

export const {
  toggleResumeSelection,
  selectAllResumes,
  clearSelectedResumes,
  setSelectedResumes,
  addAnalysisResult,
  clearAnalysisResults,
  setAnalysisResults,
  updateResume,
  clearError,
  resetResumeState
} = resumeSlice.actions

// Селекторы
export const selectAllResumeItems = (state) => state.resumes.items
export const selectResumeById = (state, id) => state.resumes.items.find(r => r.id === id)
export const selectSelectedResumeIds = (state) => state.resumes.selectedResumes
export const selectSelectedResumes = (state) => {
  const selectedIds = state.resumes.selectedResumes
  return state.resumes.items.filter(r => selectedIds.includes(r.id))
}
export const selectAnalysisResults = (state) => state.resumes.analysisResults
export const selectAnalysisResultById = (state, id) => 
  state.resumes.analysisResults.find(r => r.id === id)
export const selectIsLoading = (state) => state.resumes.isLoading
export const selectIsAnalyzing = (state) => state.resumes.isAnalyzing
export const selectResumeError = (state) => state.resumes.error
export const selectResumesCount = (state) => state.resumes.items.length
export const selectSelectedCount = (state) => state.resumes.selectedResumes.length

export default resumeSlice.reducer