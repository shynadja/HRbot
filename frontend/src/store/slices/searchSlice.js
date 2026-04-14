import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../services/api'
import { getPersonalData } from '../../utils/personalDataCache'

export const searchCandidatesAsync = createAsyncThunk(
  'search/searchCandidates',
  async ({ query, resumeIds, userId }, { rejectWithValue, getState }) => {
    try {
      const results = await api.searchCandidates(query, resumeIds, userId)
      
      const state = getState()
      const uploadedResumes = state.resumes.items
      
      const enrichedCandidates = results.candidates.map(candidate => {
        const personalData = getPersonalData(candidate.candidate_uuid)
        const resume = uploadedResumes.find(r => r.id === candidate.resume_id)
        
        const strengths = []
        if (candidate.strengths?.length > 0) {
          for (let i = 0; i < Math.min(3, candidate.strengths.length); i++) {
            const s = candidate.strengths[i]
            strengths.push(typeof s === 'string' ? s : s.description || JSON.stringify(s))
          }
        }
        
        const improvements = []
        if (candidate.improvements?.length > 0) {
          for (let i = 0; i < Math.min(2, candidate.improvements.length); i++) {
            const imp = candidate.improvements[i]
            improvements.push(typeof imp === 'string' ? imp : imp.suggestion || JSON.stringify(imp))
          }
        }
        
        return {
          ...candidate,
          firstName: personalData?.first_name || candidate.firstName || '',
          lastName: personalData?.last_name || candidate.lastName || '',
          fullName: personalData?.full_name || candidate.fullName || '',
          position: resume?.position || candidate.position || '',
          experience: resume?.experience || candidate.experience || '',
          skills: resume?.skills?.length > 0 ? resume.skills : [],
          location: resume?.location || '',
          score: candidate.score || 0,
          aiProbability: candidate.aiProbability || 0,
          suspiciousPhrases: candidate.suspiciousPhrases || [],
          strengths,
          improvements,
          final_verdict: candidate.final_verdict || {
            decision: '',
            reason: ''
          }
        }
      })
      
      return {
        candidates: enrichedCandidates,
        totalFound: results.total_found,
        analyzedDeep: results.analyzed_deep,
        aiUsed: results.ai_used || false,
        query
      }
    } catch (error) {
      return rejectWithValue(error.message || 'Ошибка при поиске кандидатов')
    }
  }
)

const searchSlice = createSlice({
  name: 'search',
  initialState: {
    query: '',
    results: [],
    totalFound: 0,
    analyzedDeep: 0,
    aiUsed: false,
    isSearching: false,
    error: null,
    lastSearch: null
  },
  reducers: {
    setSearchQuery: (state, action) => {
      state.query = action.payload
    },
    
    clearSearchResults: (state) => {
      state.results = []
      state.totalFound = 0
      state.analyzedDeep = 0
      state.aiUsed = false
      state.lastSearch = null
    },
    
    clearSearchError: (state) => {
      state.error = null
    },
    
    resetSearchState: (state) => {
      state.query = ''
      state.results = []
      state.totalFound = 0
      state.analyzedDeep = 0
      state.aiUsed = false
      state.isSearching = false
      state.error = null
      state.lastSearch = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchCandidatesAsync.pending, (state) => {
        state.isSearching = true
        state.error = null
      })
      .addCase(searchCandidatesAsync.fulfilled, (state, action) => {
        state.isSearching = false
        state.results = action.payload.candidates
        state.totalFound = action.payload.totalFound
        state.analyzedDeep = action.payload.analyzedDeep
        state.aiUsed = action.payload.aiUsed
        state.lastSearch = {
          query: action.payload.query,
          timestamp: new Date().toISOString()
        }
      })
      .addCase(searchCandidatesAsync.rejected, (state, action) => {
        state.isSearching = false
        state.error = action.payload
      })
  }
})

export const {
  setSearchQuery,
  clearSearchResults,
  clearSearchError,
  resetSearchState
} = searchSlice.actions

// Селекторы
export const selectSearchQuery = (state) => state.search.query
export const selectSearchResults = (state) => state.search.results
export const selectSearchTotalFound = (state) => state.search.totalFound
export const selectSearchAnalyzedDeep = (state) => state.search.analyzedDeep
export const selectSearchAiUsed = (state) => state.search.aiUsed
export const selectIsSearching = (state) => state.search.isSearching
export const selectSearchError = (state) => state.search.error
export const selectLastSearch = (state) => state.search.lastSearch

export default searchSlice.reducer