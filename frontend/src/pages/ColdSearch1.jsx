import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import CandidateCard from '../components/CandidateCard'
import searchIcon from '../assets/images/search-icon.png'
import './ColdSearch1.css'

const ColdSearch1 = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [error, setError] = useState(null)
  const [searchInfo, setSearchInfo] = useState(null)

  // Получение user_id из URL (Telegram Mini App)
  const getUserId = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('user_id') || 'anonymous'
  }

  // РЕАЛЬНЫЙ поиск через api.js
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    setError(null)
    setSearchResults([])
    setSearchInfo(null)
    
    try {
      const userId = getUserId()
      
      console.log('🔍 Отправка запроса:', { 
        query: searchQuery, 
        userId 
      })
      
      // Логируем действие поиска
      await api.logAction('cold_search_started', userId)
      
      // Выполняем поиск
      const response = await api.coldSearch(searchQuery, userId, 10)
      
      console.log('📦 Получен ответ:', response)
      
      if (response.success) {
        // Сохраняем информацию о поиске
        setSearchInfo({
          queryId: response.query_id,
          totalFound: response.total_found,
          analyzedDeep: response.analyzed_deep,
          cachedCount: response.cached_count,
          filters: response.filters
        })
        
        // Преобразуем данные для компонента CandidateCard
        const formattedCandidates = response.candidates.map(candidate => ({
          id: candidate.id,
          firstName: candidate.first_name,
          lastName: candidate.last_name,
          position: candidate.position,
          company: candidate.company,
          experience: candidate.experience,
          skills: candidate.skills || [],
          phone: candidate.phone,
          // Данные из анализа
          score: candidate.score,
          strengths: candidate.strengths,
          weaknesses: candidate.weaknesses,
          ai_detection: candidate.ai_detection,
          key_skills: candidate.key_skills,
          experience_analysis: candidate.experience_analysis,
          recommendation: candidate.recommendation,
          // Метаданные
          rank: candidate.rank,
          cached: candidate.cached_quick
        }))
        
        setSearchResults(formattedCandidates)
        
        // Логируем успешный поиск
        await api.logAction('cold_search_completed', userId)
      } else {
        setError(response.message || 'Не удалось найти кандидатов')
      }
    } catch (err) {
      console.error('❌ Ошибка поиска:', err)
      
      // Более детальная обработка ошибок
      if (err.response) {
        // Ошибка от сервера
        setError(`Ошибка сервера: ${err.response.status} - ${err.response.data?.detail || 'Неизвестная ошибка'}`)
      } else if (err.request) {
        // Нет ответа от сервера
        setError('Сервер не отвечает. Проверьте, запущен ли бэкенд и доступен ли по сети.')
      } else {
        // Другая ошибка
        setError(`Ошибка: ${err.message}`)
      }
      
      // Логируем ошибку
      const userId = getUserId()
      await api.logAction('cold_search_error', userId)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Холодный подбор</h1>
      </div>
      
      <div className="cold-search-content">
        <p className="search-description">
          Введите запрос для поиска кандидатов. Например, "Frontend разработчик" или "Python developer"
        </p>
        
        <div className="search-input-wrapper">
          <input
            type="text"
            className={`search-input ${searchQuery ? 'has-text' : ''}`}
            placeholder="Введите запрос..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            disabled={isSearching}
          />
          <img src={searchIcon} alt="Поиск" className="search-icon" />
        </div>
        
        <button 
          className={`search-button ${searchQuery ? 'active' : ''}`}
          onClick={handleSearch}
          disabled={!searchQuery.trim() || isSearching}
        >
          {isSearching ? 'Поиск...' : 'Запустить подбор'}
        </button>

        {/* Информация о поиске */}
        {searchInfo && !isSearching && searchResults.length > 0 && (
          <div style={{
            backgroundColor: '#1E3A5F',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#8CA0B5'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>📊 Всего найдено: <strong>{searchInfo.totalFound}</strong></span>
              <span>🔍 Глубокий анализ: <strong>{searchInfo.analyzedDeep}</strong></span>
              <span>💾 Из кеша: <strong>{searchInfo.cachedCount || 0}</strong></span>
            </div>
            {searchInfo.filters && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                🏷️ Фильтры: {
                  Object.entries(searchInfo.filters)
                    .filter(([key]) => !['original_query', 'search_query'].includes(key))
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')
                }
              </div>
            )}
          </div>
        )}

        {/* Ошибка */}
        {error && (
          <div style={{
            color: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            textAlign: 'center',
            border: '1px solid #ff6b6b'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Индикатор загрузки */}
        {isSearching && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            color: '#229ED9'
          }}>
            <div className="spinner" style={{
              width: '50px',
              height: '50px',
              border: '4px solid #24405CCF',
              borderTop: '4px solid #229ED9',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '20px'
            }} />
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>Ищем лучших кандидатов...</p>
            <p style={{ fontSize: '13px', color: '#8CA0B5' }}>
              Это может занять до 30 секунд
            </p>
            <p style={{ fontSize: '12px', color: '#4A9BD6', marginTop: '10px' }}>
              Запрос: "{searchQuery}"
            </p>
          </div>
        )}

        {/* Результаты поиска */}
        {searchResults.length > 0 && !isSearching && (
          <>
            <div className="results-count">
              Найдено кандидатов: {searchResults.length}
              {searchInfo?.cachedCount > 0 && (
                <span style={{ marginLeft: '10px', fontSize: '14px', color: '#4A9BD6' }}>
                  (из кеша: {searchInfo.cachedCount})
                </span>
              )}
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
      </div>

      {/* Стили для анимации */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ColdSearch1