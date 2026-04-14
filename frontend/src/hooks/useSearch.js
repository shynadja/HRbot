import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from './useRedux'
import {
  searchCandidatesAsync,
  setSearchQuery,
  clearSearchResults,
  clearSearchError,
  resetSearchState,
  selectSearchQuery,
  selectSearchResults,
  selectSearchTotalFound,
  selectSearchAnalyzedDeep,
  selectSearchAiUsed,
  selectIsSearching,
  selectSearchError,
  selectLastSearch
} from '../store/slices/searchSlice'

export const useSearch = () => {
  const dispatch = useAppDispatch()
  
  const query = useAppSelector(selectSearchQuery)
  const results = useAppSelector(selectSearchResults)
  const totalFound = useAppSelector(selectSearchTotalFound)
  const analyzedDeep = useAppSelector(selectSearchAnalyzedDeep)
  const aiUsed = useAppSelector(selectSearchAiUsed)
  const isSearching = useAppSelector(selectIsSearching)
  const error = useAppSelector(selectSearchError)
  const lastSearch = useAppSelector(selectLastSearch)
  
  const search = useCallback((searchQuery, resumeIds, userId) => {
    return dispatch(searchCandidatesAsync({ 
      query: searchQuery, 
      resumeIds, 
      userId 
    })).unwrap()
  }, [dispatch])
  
  const setQuery = useCallback((value) => {
    dispatch(setSearchQuery(value))
  }, [dispatch])
  
  const clearResults = useCallback(() => {
    dispatch(clearSearchResults())
  }, [dispatch])
  
  const clearError = useCallback(() => {
    dispatch(clearSearchError())
  }, [dispatch])
  
  const resetState = useCallback(() => {
    dispatch(resetSearchState())
  }, [dispatch])
  
  return {
    // Состояние
    query,
    results,
    totalFound,
    analyzedDeep,
    aiUsed,
    isSearching,
    error,
    lastSearch,
    
    // Действия
    search,
    setQuery,
    clearResults,
    clearError,
    resetState
  }
}