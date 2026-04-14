import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, FileText, Check, ChevronDown, ChevronUp, AlertCircle, Loader } from 'lucide-react'
import CandidateCard from '../components/CandidateCard'
import ResumeCard from '../components/ResumeCard'
import { useAuth } from '../hooks/useAuth'
import { useResumes } from '../hooks/useResumes'
import { useSearch } from '../hooks/useSearch'
import { useUI } from '../hooks/useUI'
import './FindCandidate.css'

const FindCandidate = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  
  const {
    items: uploadedResumes,
    selectedIds: selectedResumes,
    isLoading: isLoadingResumes,
    loadResumes,
    toggleSelection,
    selectAll,
    isSelected,
    setSelection,
    getAnalysisResult
  } = useResumes()
  
  const {
    query: searchQuery,
    results: searchResults,
    aiUsed,
    isSearching,
    error: searchError,
    search,
    setQuery
  } = useSearch()
  
  const {
    showResumeSelector: { findCandidate: showResumeSelector },
    toggleSelector,
    showNotification
  } = useUI()
  
  const [error, setError] = useState(null)

  useEffect(() => {
    if (user?.id) {
      loadResumes(user.id)
    }
  }, [loadResumes, user?.id])

  useEffect(() => {
    if (location.state?.selectedResumes) {
      setSelection(location.state.selectedResumes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const handleSearch = async () => {
    if (!searchQuery.trim() || selectedResumes.length === 0) {
      setError('Пожалуйста, введите запрос и выберите резюме')
      return
    }
    
    setError(null)
    
    try {
      const result = await search(searchQuery, selectedResumes, user?.id)
      showNotification(`Найдено ${result.totalFound} кандидатов`, 'success')
    } catch (err) {
      console.error('Ошибка поиска:', err)
      setError('Произошла ошибка при поиске кандидатов')
    }
  }

  // Функция для получения данных детекции ИИ из Redux
  const getAIAnalysisData = (resumeId) => {
    const analysisResult = getAnalysisResult(resumeId)
    const resume = uploadedResumes.find(r => r.id === resumeId)
    
    // Приоритет: Redux analysisResults > resume.analysis
    if (analysisResult) {
      return {
        aiProbability: analysisResult.aiProbability || 0,
        suspiciousPhrases: analysisResult.suspiciousPhrases || []
      }
    }
    
    if (resume?.analysis) {
      return {
        aiProbability: resume.analysis.aiProbability || 0,
        suspiciousPhrases: resume.analysis.suspiciousPhrases || []
      }
    }
    
    return {
      aiProbability: 0,
      suspiciousPhrases: []
    }
  }

  // Обогащение кандидатов данными детекции ИИ
  const enrichCandidatesWithAIData = (candidates) => {
    return candidates.map(candidate => {
      const aiData = getAIAnalysisData(candidate.resume_id)
      return {
        ...candidate,
        aiProbability: aiData.aiProbability,
        suspiciousPhrases: aiData.suspiciousPhrases
      }
    })
  }

  // Сортируем кандидатов по score (от высшего к низшему)
  const sortedCandidates = [...searchResults].sort((a, b) => (b.score || 0) - (a.score || 0))
  
  // Обогащаем данными детекции ИИ
  const enrichedCandidates = enrichCandidatesWithAIData(sortedCandidates)

  if (isLoadingResumes) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="back-button" onClick={() => navigate('/')}>←</button>
          <h1 className="page-title">Подобрать сотрудника</h1>
        </div>
        <div className="loading-state">
          <Loader size={40} className="spinning" />
          <p>Загрузка резюме...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Подобрать сотрудника</h1>
      </div>
      
      <div className="find-candidate-content">
        {uploadedResumes.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>Нет загруженных резюме</h3>
            <p>Сначала загрузите резюме для анализа</p>
            <button className="upload-btn" onClick={() => navigate('/upload-resume')}>
              Загрузить резюме
            </button>
          </div>
        ) : (
          <>
            <p className="search-description">
              Введите требования к кандидату и выберите резюме для анализа
            </p>
            
            <div className="search-input-wrapper">
              <input
                type="text"
                className={`search-input ${searchQuery ? 'has-text' : ''}`}
                placeholder="Введите требования (например, Python разработчик от 3 лет)..."
                value={searchQuery}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
              />
              <Search size={24} className="search-icon" />
            </div>

            <div className="resume-selector-section">
              <button 
                className={`resume-selector-header ${showResumeSelector ? 'active' : ''}`}
                onClick={() => toggleSelector('findCandidate')}
              >
                <div className="selector-title">
                  <FileText size={20} />
                  <span>Выбрать резюме</span>
                </div>
                <div className="selector-info">
                  <span className="selected-count">Выбрано: {selectedResumes.length}</span>
                  {showResumeSelector ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {showResumeSelector && (
                <div className="resume-selector-dropdown">
                  <div className="selector-actions">
                    <button className="select-all-btn" onClick={selectAll}>
                      <Check size={16} />
                      <span>{selectedResumes.length === uploadedResumes.length ? 'Снять все' : 'Выбрать все'}</span>
                    </button>
                  </div>
                  
                  <div className="resume-list">
                    {uploadedResumes.map(resume => (
                      <ResumeCard
                        key={resume.id}
                        resume={resume}
                        selected={isSelected(resume.id)}
                        onSelect={toggleSelection}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <button 
              className={`search-button ${searchQuery && selectedResumes.length > 0 ? 'active' : ''}`}
              onClick={handleSearch}
              disabled={!searchQuery.trim() || selectedResumes.length === 0 || isSearching}
            >
              {isSearching ? (
                <>
                  <Loader size={18} className="spinning" />
                  <span>Анализ...</span>
                </>
              ) : (
                'Подобрать сотрудника'
              )}
            </button>

            {(error || searchError) && (
              <div className="error-message">
                <AlertCircle size={18} />
                <span>{error || searchError}</span>
              </div>
            )}

            {enrichedCandidates.length > 0 && !isSearching && (
              <>
                <div className="results-count">
                  {aiUsed ? 'Анализ завершен' : 'Результаты поиска'}: {enrichedCandidates.length} кандидатов
                  {selectedResumes.length > enrichedCandidates.length && (
                    <span style={{ fontSize: '14px', marginLeft: '10px', color: '#8CA0B5' }}>
                      (отобраны {enrichedCandidates.length} наиболее подходящих из {selectedResumes.length})
                    </span>
                  )}
                </div>
                
                <div className="candidates-list">
                  {enrichedCandidates.map((candidate) => (
                    <CandidateCard key={candidate.id} candidate={candidate} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default FindCandidate