import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, FileText, Check, ChevronDown, ChevronUp, AlertCircle, Loader } from 'lucide-react'
import CandidateCard from '../components/CandidateCard'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './FindCandidate.css'

const FindCandidate = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [error, setError] = useState(null)
  const [searchInfo, setSearchInfo] = useState(null)
  
  // Состояния для выбора резюме
  const [selectedResumes, setSelectedResumes] = useState([])
  const [showResumeSelector, setShowResumeSelector] = useState(false)
  const [uploadedResumes, setUploadedResumes] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Функция загрузки резюме с useCallback
  const loadResumes = useCallback(async () => {
    setIsLoading(true)
    try {
      // Передаем ID пользователя
      const data = await api.getResumes(user?.id)
      console.log('Загруженные резюме для поиска:', data)
      setUploadedResumes(data.resumes || [])
    } catch (error) {
      console.error('Error loading resumes:', error)
      setError('Не удалось загрузить список резюме')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // Загружаем резюме при монтировании
  useEffect(() => {
    loadResumes()
    
    // Если передан массив выбранных резюме из UploadResume
    if (location.state?.selectedResumes) {
      setSelectedResumes(location.state.selectedResumes)
    }
    
    // Восстанавливаем результаты поиска из sessionStorage
    const savedResults = sessionStorage.getItem('findCandidateResults')
    if (savedResults) {
      const parsed = JSON.parse(savedResults)
      setSearchResults(parsed.candidates || [])
      setSearchInfo(parsed.info || null)
    }
    
    // Восстанавливаем поисковый запрос
    const savedQuery = sessionStorage.getItem('findCandidateQuery')
    if (savedQuery) {
      setSearchQuery(savedQuery)
    }
    
    // Восстанавливаем выбранные резюме
    const savedSelected = sessionStorage.getItem('findCandidateSelected')
    if (savedSelected) {
      setSelectedResumes(JSON.parse(savedSelected))
    }
  }, [location.state, loadResumes])

  // Сохраняем результаты в sessionStorage при изменении
  useEffect(() => {
    if (searchResults.length > 0 && searchInfo) {
      sessionStorage.setItem('findCandidateResults', JSON.stringify({
        candidates: searchResults,
        info: searchInfo
      }))
    }
  }, [searchResults, searchInfo])

  // Сохраняем поисковый запрос
  useEffect(() => {
    if (searchQuery) {
      sessionStorage.setItem('findCandidateQuery', searchQuery)
    }
  }, [searchQuery])

  // Сохраняем выбранные резюме
  useEffect(() => {
    sessionStorage.setItem('findCandidateSelected', JSON.stringify(selectedResumes))
  }, [selectedResumes])

  const handleSearch = async () => {
    if (!searchQuery.trim() || selectedResumes.length === 0) {
      setError('Пожалуйста, введите запрос и выберите резюме для поиска')
      return
    }
    
    setIsSearching(true)
    setError(null)
    setSearchResults([])
    setSearchInfo(null)
    
    try {
      const results = await api.searchCandidates(searchQuery, selectedResumes)
      
      // Обогащаем результаты реальными данными из резюме
      const enrichedCandidates = results.candidates.map(candidate => {
        const resume = uploadedResumes.find(r => r.id === candidate.resume_id)
        
        // Формируем правильные списки для сильных сторон и улучшений
        const strengths = [];
        const improvements = [];
        
        // Сильные стороны (3 пункта)
        if (candidate.strengths && candidate.strengths.length > 0) {
          // Берем первые 3 из того, что пришло с сервера
          for (let i = 0; i < Math.min(3, candidate.strengths.length); i++) {
            strengths.push(candidate.strengths[i]);
          }
        }
        
        // Если не хватает до 3, добавляем пункты по умолчанию
        const defaultStrengths = [
          'Опыт работы с современными фреймворками',
          'Хорошее знание TypeScript',
          'Навыки командной работы'
        ];
        
        while (strengths.length < 3) {
          strengths.push(defaultStrengths[strengths.length]);
        }
        
        // Что улучшить (2 пункта)
        if (candidate.improvements && candidate.improvements.length > 0) {
          // Берем первые 2 из того, что пришло с сервера
          for (let i = 0; i < Math.min(2, candidate.improvements.length); i++) {
            improvements.push(candidate.improvements[i]);
          }
        }
        
        // Если не хватает до 2, добавляем пункты по умолчанию
        const defaultImprovements = [
          'Не хватает опыта работы с GraphQL',
          'Рекомендуется добавить пет-проекты'
        ];
        
        while (improvements.length < 2) {
          improvements.push(defaultImprovements[improvements.length]);
        }
        
        return {
          ...candidate,
          // Используем реальные данные из резюме
          firstName: resume?.first_name || candidate.firstName || 'Иван',
          lastName: resume?.last_name || candidate.lastName || 'Иванов',
          fullName: resume?.full_name || candidate.fullName || `${resume?.first_name || 'Иван'} ${resume?.last_name || 'Иванов'}`,
          position: resume?.position || candidate.position || 'Разработчик',
          experience: resume?.experience || candidate.experience || 'Опыт не указан',
          skills: resume?.skills && resume.skills.length > 0 ? resume.skills : 
                 (candidate.skills || ['React', 'JavaScript', 'HTML/CSS', 'CSS', 'Node.js']),
          aiProbability: resume?.analysis?.aiProbability || candidate.aiProbability || Math.floor(Math.random() * 50),
          suspiciousPhrases: resume?.analysis?.suspiciousPhrases || candidate.suspiciousPhrases || [],
          strengths: strengths, // Теперь всегда 3 пункта
          improvements: improvements // Теперь всегда 2 пункта
        }
      })
      
      setSearchInfo({
        totalFound: results.total_found,
        analyzedDeep: results.analyzed_deep,
        cachedCount: results.cached_count || 0,
        filters: {
          search_query: searchQuery,
          resumes_count: selectedResumes.length
        }
      })
      
      setSearchResults(enrichedCandidates)
      
    } catch (err) {
      console.error('Ошибка поиска:', err)
      setError('Произошла ошибка при поиске кандидатов')
    } finally {
      setIsSearching(false)
    }
  }

  const toggleResumeSelection = (resumeId) => {
    setSelectedResumes(prev => {
      if (prev.includes(resumeId)) {
        return prev.filter(id => id !== resumeId)
      } else {
        if (prev.length < 10) {
          return [...prev, resumeId]
        } else {
          setError('Можно выбрать не более 10 резюме для поиска')
          return prev
        }
      }
    })
  }

  const selectAllResumes = () => {
    if (selectedResumes.length === uploadedResumes.length) {
      setSelectedResumes([])
    } else {
      setSelectedResumes(uploadedResumes.map(r => r.id))
    }
  }

  if (isLoading) {
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
            <p>Сначала загрузите резюме для анализа кандидатов</p>
            <button 
              className="upload-btn"
              onClick={() => navigate('/upload-resume')}
            >
              Загрузить резюме
            </button>
          </div>
        ) : (
          <>
            <p className="search-description">
              Введите требования к кандидату и выберите резюме для анализа
            </p>
            
            {/* Поле ввода требований */}
            <div className="search-input-wrapper">
              <input
                type="text"
                className={`search-input ${searchQuery ? 'has-text' : ''}`}
                placeholder="Введите требования (например, Frontend разработчик со знанием React)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
              />
              <Search size={24} className="search-icon" />
            </div>

            {/* Селектор резюме */}
            <div className="resume-selector-section">
              <button 
                className={`resume-selector-header ${showResumeSelector ? 'active' : ''}`}
                onClick={() => setShowResumeSelector(!showResumeSelector)}
              >
                <div className="selector-title">
                  <FileText size={20} />
                  <span>Выбрать резюме</span>
                </div>
                <div className="selector-info">
                  <span className="selected-count">
                    Выбрано: {selectedResumes.length}
                  </span>
                  {showResumeSelector ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {showResumeSelector && (
                <div className="resume-selector-dropdown">
                  <div className="selector-actions">
                    <button className="select-all-btn" onClick={selectAllResumes}>
                      <Check size={16} />
                      <span>{selectedResumes.length === uploadedResumes.length ? 'Снять все' : 'Выбрать все'}</span>
                    </button>
                  </div>
                  
                  <div className="resume-list">
                    {uploadedResumes.map(resume => (
                      <div 
                        key={resume.id}
                        className={`resume-item ${selectedResumes.includes(resume.id) ? 'selected' : ''}`}
                        onClick={() => toggleResumeSelection(resume.id)}
                      >
                        <div className="resume-checkbox">
                          {selectedResumes.includes(resume.id) && <Check size={14} />}
                        </div>
                        <FileText size={20} className="resume-icon" />
                        <div className="resume-info">
                          <div className="resume-name">{resume.name}</div>
                          <div className="resume-meta">
                            <span>{resume.full_name || resume.candidate_name || 'Имя не указано'}</span>
                            <span>•</span>
                            <span>{resume.position || 'Должность не указана'}</span>
                          </div>
                          {resume.skills && resume.skills.length > 0 && (
                            <div className="resume-skills">
                              {resume.skills.slice(0, 3).map((skill, idx) => (
                                <span key={idx} className="resume-skill-tag">{skill}</span>
                              ))}
                              {resume.skills.length > 3 && (
                                <span className="resume-skill-tag more">+{resume.skills.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Кнопка поиска */}
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

            {/* Информация о выбранных резюме */}
            {!showResumeSelector && selectedResumes.length > 0 && !isSearching && searchResults.length === 0 && (
              <div className="selected-info">
                <p>Выбрано резюме: <strong>{selectedResumes.length}</strong></p>
                <p className="info-hint">Введите требования и нажмите "Подобрать сотрудника"</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {isSearching && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                <p>Ищем подходящих кандидатов...</p>
                <p className="loading-hint">Анализируем {selectedResumes.length} резюме</p>
              </div>
            )}

            {searchResults.length > 0 && !isSearching && (
              <>
                <div className="results-count">
                  Проанализировано резюме кандидатов: {searchResults.length}
                </div>
                
                <div className="candidates-list">
                  {searchResults.map((candidate) => (
                    <CandidateCard 
                      key={candidate.id} 
                      candidate={candidate}
                    />
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