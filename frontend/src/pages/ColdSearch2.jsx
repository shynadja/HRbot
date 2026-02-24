import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CandidateCard from '../components/CandidateCard'
import './ColdSearch2.css'

const ColdSearch2 = () => {
  const navigate = useNavigate()
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  
  // Состояния для полей фильтрации
  const [position, setPosition] = useState('')
  const [experience, setExperience] = useState('')
  const [skills, setSkills] = useState('')
  const [location, setLocation] = useState('')

  // Проверка, заполнены ли все поля
  const isFormValid = position && experience && skills && location

  // Временная функция для имитации поиска
  const handleSearch = () => {
    if (!isFormValid) return
    
    setIsSearching(true)
    
    // Имитация загрузки
    setTimeout(() => {
      setSearchResults([
        {
          id: 1,
          firstName: 'Алексей',
          lastName: 'Смирнов',
          position: 'Senior Frontend Developer',
          company: 'Яндекс',
          experience: '5 лет 3 месяца',
          skills: ['React', 'TypeScript', 'Redux'],
          phone: '+79161234567'
        },
        {
          id: 2,
          firstName: 'Мария',
          lastName: 'Петрова',
          position: 'Frontend Developer',
          company: 'VK',
          experience: '3 года 8 месяцев',
          skills: ['Vue.js', 'JavaScript', 'SCSS'],
          phone: '+79161234567'
        },
        {
          id: 3,
          firstName: 'Дмитрий',
          lastName: 'Иванов',
          position: 'Fullstack Developer',
          company: 'СберТех',
          experience: '4 года 2 месяца',
          skills: ['React', 'Node.js', 'Python'],
          phone: '+79161234567'
        },
        {
          id: 4,
          firstName: 'Екатерина',
          lastName: 'Соколова',
          position: 'Middle Frontend Developer',
          company: 'Ozon',
          experience: '2 года 9 месяцев',
          skills: ['React', 'TypeScript', 'Next.js'],
          phone: '+79161234567'
        },
        {
          id: 5,
          firstName: 'Павел',
          lastName: 'Козлов',
          position: 'Frontend Team Lead',
          company: 'Avito',
          experience: '6 лет 5 месяцев',
          skills: ['React', 'Redux', 'Webpack'],
          phone: '+79161234567'
        }
      ])
      setIsSearching(false)
    }, 1500)
  }

  // Варианты для выпадающих списков
  const positionOptions = [
    'Frontend Developer',
    'Backend Developer',
    'Fullstack Developer',
    'Mobile Developer',
    'DevOps Engineer',
    'QA Engineer',
    'Project Manager',
    'Product Manager',
    'UI/UX Designer',
    'Data Scientist'
  ]

  const experienceOptions = [
    'Без опыта',
    '1-3 года',
    '3-5 лет',
    '5-7 лет',
    '7-10 лет',
    'Более 10 лет'
  ]

  const skillsOptions = [
    'JavaScript',
    'TypeScript',
    'React',
    'Vue.js',
    'Angular',
    'Node.js',
    'Python',
    'Java',
    'C#',
    'PHP',
    'Go',
    'Rust',
    'SQL',
    'MongoDB',
    'Docker',
    'Kubernetes',
    'AWS',
    'Figma'
  ]

  const locationOptions = [
    'Москва',
    'Санкт-Петербург',
    'Казань',
    'Новосибирск',
    'Екатеринбург',
    'Нижний Новгород',
    'Удаленно',
    'Релокейт'
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Холодный подбор</h1>
      </div>
      
      <div className="cold-search-content">
        <p className="search-description">
          Укажите параметры для более точного подбора кандидатов
        </p>
        
        <div className="filters-form">
          {/* Должность */}
          <div className="filter-group">
            <label className="filter-label">Должность</label>
            <select 
              className={`filter-select ${position ? 'has-value' : ''}`}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="" disabled>Выберите должность</option>
              {positionOptions.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Опыт работы */}
          <div className="filter-group">
            <label className="filter-label">Опыт работы</label>
            <select 
              className={`filter-select ${experience ? 'has-value' : ''}`}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            >
              <option value="" disabled>Выберите опыт работы</option>
              {experienceOptions.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Навыки */}
          <div className="filter-group">
            <label className="filter-label">Навыки</label>
            <select 
              className={`filter-select ${skills ? 'has-value' : ''}`}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            >
              <option value="" disabled>Выберите ключевой навык</option>
              {skillsOptions.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Локация */}
          <div className="filter-group">
            <label className="filter-label">Локация</label>
            <select 
              className={`filter-select ${location ? 'has-value' : ''}`}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="" disabled>Выберите локацию</option>
              {locationOptions.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        
        <button 
          className={`search-button ${isFormValid ? 'active' : ''}`}
          onClick={handleSearch}
          disabled={!isFormValid || isSearching}
        >
          {isSearching ? 'Поиск...' : 'Запустить подбор'}
        </button>

        {searchResults.length > 0 && (
          <>
            <div className="results-count">
              Найдено кандидатов: {searchResults.length}
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
    </div>
  )
}

export default ColdSearch2