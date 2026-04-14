import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from './useRedux'
import {
  toggleResumeSelector,
  setShowResumeSelector,
  setGlobalLoading,
  showNotification as showNotificationAction,
  hideNotification,
  setCurrentPage,
  resetUIState,
  selectShowResumeSelector,
  selectGlobalLoading,
  selectNotification,
  selectCurrentPage
} from '../store/slices/uiSlice'

export const useUI = () => {
  const dispatch = useAppDispatch()
  
  const showResumeSelectorCheck = useAppSelector((state) => 
    selectShowResumeSelector(state, 'checkResume')
  )
  const showResumeSelectorFind = useAppSelector((state) => 
    selectShowResumeSelector(state, 'findCandidate')
  )
  const globalLoading = useAppSelector(selectGlobalLoading)
  const notification = useAppSelector(selectNotification)
  const currentPage = useAppSelector(selectCurrentPage)
  
  const toggleSelector = useCallback((page) => {
    dispatch(toggleResumeSelector(page))
  }, [dispatch])
  
  const setSelectorVisibility = useCallback((page, value) => {
    dispatch(setShowResumeSelector({ page, value }))
  }, [dispatch])
  
  const setLoading = useCallback((value) => {
    dispatch(setGlobalLoading(value))
  }, [dispatch])
  
  const showNotification = useCallback((message, type = 'info') => {
    dispatch(showNotificationAction({ message, type }))
    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
      dispatch(hideNotification())
    }, 3000)
  }, [dispatch])
  
  const hideNotificationHandler = useCallback(() => {
    dispatch(hideNotification())
  }, [dispatch])
  
  const setPage = useCallback((page) => {
    dispatch(setCurrentPage(page))
  }, [dispatch])
  
  const resetState = useCallback(() => {
    dispatch(resetUIState())
  }, [dispatch])
  
  return {
    // Состояние
    showResumeSelector: {
      checkResume: showResumeSelectorCheck,
      findCandidate: showResumeSelectorFind
    },
    globalLoading,
    notification,
    currentPage,
    
    // Действия
    toggleSelector,
    setSelectorVisibility,
    setLoading,
    showNotification,
    hideNotification: hideNotificationHandler,
    setPage,
    resetState
  }
}