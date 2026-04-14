import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from './useRedux'
import {
  fetchResumes,
  deleteResumeAsync,
  analyzeResumeAsync,
  toggleResumeSelection,
  selectAllResumes as selectAllAction,
  clearSelectedResumes,
  setSelectedResumes,
  clearAnalysisResults,
  resetResumeState,
  selectAllResumeItems,
  selectSelectedResumeIds,
  selectSelectedResumes,
  selectAnalysisResults,
  selectIsLoading,
  selectIsAnalyzing,
  selectResumeError,
  selectResumesCount,
  selectSelectedCount
} from '../store/slices/resumeSlice'

export const useResumes = () => {
  const dispatch = useAppDispatch()
  
  const items = useAppSelector(selectAllResumeItems)
  const selectedIds = useAppSelector(selectSelectedResumeIds)
  const selectedResumes = useAppSelector(selectSelectedResumes)
  const analysisResults = useAppSelector(selectAnalysisResults)
  const isLoading = useAppSelector(selectIsLoading)
  const isAnalyzing = useAppSelector(selectIsAnalyzing)
  const error = useAppSelector(selectResumeError)
  const totalCount = useAppSelector(selectResumesCount)
  const selectedCount = useAppSelector(selectSelectedCount)
  
  const loadResumes = useCallback((userId) => {
    return dispatch(fetchResumes(userId)).unwrap()
  }, [dispatch])
  
  const deleteResume = useCallback((resumeId) => {
    return dispatch(deleteResumeAsync(resumeId)).unwrap()
  }, [dispatch])
  
  const analyzeResume = useCallback((resumeId) => {
    return dispatch(analyzeResumeAsync(resumeId)).unwrap()
  }, [dispatch])
  
  const analyzeMultipleResumes = useCallback(async (resumeIds) => {
    const results = []
    for (const id of resumeIds) {
      try {
        const result = await dispatch(analyzeResumeAsync(id)).unwrap()
        results.push(result)
      } catch (error) {
        console.error(`Error analyzing resume ${id}:`, error)
        results.push({ id, error })
      }
    }
    return results
  }, [dispatch])
  
  const toggleSelection = useCallback((resumeId) => {
    dispatch(toggleResumeSelection(resumeId))
  }, [dispatch])
  
  const selectAll = useCallback(() => {
    dispatch(selectAllAction())
  }, [dispatch])
  
  const clearSelection = useCallback(() => {
    dispatch(clearSelectedResumes())
  }, [dispatch])
  
  const setSelection = useCallback((ids) => {
    dispatch(setSelectedResumes(ids))
  }, [dispatch])
  
  const clearAnalysis = useCallback(() => {
    dispatch(clearAnalysisResults())
  }, [dispatch])
  
  const resetState = useCallback(() => {
    dispatch(resetResumeState())
  }, [dispatch])
  
  const isSelected = useCallback((resumeId) => {
    return selectedIds.includes(resumeId)
  }, [selectedIds])
  
  const getResumeById = useCallback((id) => {
    return items.find(r => r.id === id)
  }, [items])
  
  const getAnalysisResult = useCallback((id) => {
    return analysisResults.find(r => r.id === id)
  }, [analysisResults])
  
  return {
    // Состояние
    items,
    selectedIds,
    selectedResumes,
    analysisResults,
    isLoading,
    isAnalyzing,
    error,
    totalCount,
    selectedCount,
    
    // Действия
    loadResumes,
    deleteResume,
    analyzeResume,
    analyzeMultipleResumes,
    toggleSelection,
    selectAll,
    clearSelection,
    setSelection,
    clearAnalysis,
    resetState,
    
    // Утилиты
    isSelected,
    getResumeById,
    getAnalysisResult
  }
}