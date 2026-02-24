import React, { useState, useRef, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  X,
  ThumbsUp,
  TrendingUp,
  Trash2,
  Phone,
  ChevronDown,
  ChevronUp,
  Loader
} from 'lucide-react'
import './CheckResume.css'

const CheckResume = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [analysisResults, setAnalysisResults] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [expandedFileId, setExpandedFileId] = useState(null)
  
  // Используем useId для генерации уникальных префиксов
  const idPrefix = useId()

  // Допустимые форматы файлов
  const allowedFormats = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  const maxSize = 5 * 1024 * 1024 // 5 MB
  const maxFiles = 10 // Максимальное количество файлов

  // Счетчик для генерации уникальных ID
  const fileIdCounter = useRef(0)

  // Функция для генерации уникального ID
  const generateFileId = () => {
    fileIdCounter.current += 1
    return `${idPrefix}-file-${fileIdCounter.current}-${Date.now()}`
  }

  // Обработка выбора файла
  const handleFileSelect = (file) => {
    // Проверка формата
    if (!allowedFormats.includes(file.type)) {
      alert('❌ Ошибка: Пожалуйста, выберите файл в формате PDF, DOC или DOCX')
      return
    }

    // Проверка размера
    if (file.size > maxSize) {
      alert('❌ Ошибка: Размер файла не должен превышать 5 МБ')
      return
    }

    // Проверка на дубликаты
    const isDuplicate = uploadedFiles.some(f => f.name === file.name && f.originalSize === file.size)
    if (isDuplicate) {
      alert('❌ Ошибка: Файл с таким именем уже загружен')
      return
    }

    // Проверка максимального количества файлов
    if (uploadedFiles.length >= maxFiles) {
      alert(`❌ Ошибка: Максимальное количество файлов - ${maxFiles}`)
      return
    }

    // Форматирование размера файла
    const fileSize = formatFileSize(file.size)
    
    const newFile = {
      id: generateFileId(),
      name: file.name,
      size: fileSize,
      originalSize: file.size,
      file: file,
      uploadDate: new Date().toISOString()
    }
    
    setUploadedFiles(prevFiles => [...prevFiles, newFile])
    setAnalysisResults(prevResults => [...prevResults, null])
  }

  // Обработка изменения input файла
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length + uploadedFiles.length > maxFiles) {
        alert(`❌ Ошибка: Можно загрузить не более ${maxFiles} файлов`)
        return
      }
      
      Array.from(e.target.files).forEach(file => {
        handleFileSelect(file)
      })
    }
  }

  // Обработка перетаскивания
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length + uploadedFiles.length > maxFiles) {
        alert(`❌ Ошибка: Можно загрузить не более ${maxFiles} файлов`)
        return
      }
      
      Array.from(e.dataTransfer.files).forEach(file => {
        handleFileSelect(file)
      })
    }
  }

  // Форматирование размера файла
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' Б'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
  }

  // Удаление файла
  const removeFile = (fileId, e) => {
    e.stopPropagation()
    const fileIndex = uploadedFiles.findIndex(f => f.id === fileId)
    
    setUploadedFiles(prevFiles => prevFiles.filter(f => f.id !== fileId))
    setAnalysisResults(prevResults => prevResults.filter((_, index) => index !== fileIndex))
    
    if (expandedFileId === fileId) {
      setExpandedFileId(null)
    }
  }

  // Удаление всех файлов
  const removeAllFiles = () => {
    setUploadedFiles([])
    setAnalysisResults([])
    setExpandedFileId(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Обработчик разворачивания/сворачивания блока
  const toggleExpand = (fileId) => {
    if (expandedFileId === fileId) {
      setExpandedFileId(null)
    } else {
      setExpandedFileId(fileId)
    }
  }

  // Функция для анализа всех файлов
  const handleAnalyzeAll = () => {
    if (uploadedFiles.length === 0) return
    
    setIsAnalyzing(true)
    
    setTimeout(() => {
      const newResults = [...analysisResults]
      
      uploadedFiles.forEach((file, index) => {
        if (!newResults[index]) {
          const randomScore = Math.floor(Math.random() * 30) + 70
          
          // Извлекаем имя файла без расширения для демонстрации
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
          const nameParts = fileNameWithoutExt.split('_')
          
          newResults[index] = {
            score: randomScore,
            firstName: nameParts[0] || 'Иван',
            lastName: nameParts[1] || 'Петров',
            position: 'Senior Frontend Developer',
            company: 'Технологическая компания',
            experience: '5 лет 3 месяца',
            skills: ['React', 'TypeScript', 'Redux', 'Node.js', 'GraphQL'],
            strengths: [
              'Опыт работы с современными фреймворками',
              'Хорошее знание TypeScript и архитектурных паттернов',
              'Навыки командной работы и коммуникации'
            ],
            improvements: [
              'Не хватает опыта работы с GraphQL',
              'Рекомендуется добавить раздел с пет-проектами',
              'Можно улучшить описание достижений'
            ].slice(0, Math.floor(Math.random() * 2) + 2)
          }
        }
      })
      
      setAnalysisResults(newResults)
      setIsAnalyzing(false)
      
      // Автоматически разворачиваем первый файл, если есть результаты
      if (uploadedFiles.length > 0 && !expandedFileId) {
        setExpandedFileId(uploadedFiles[0].id)
      }
    }, 2000)
  }

  // Функция для анализа конкретного файла
  const analyzeSingleFile = (index) => {
    if (analysisResults[index]) return // Уже проанализирован
    
    setIsAnalyzing(true)
    
    setTimeout(() => {
      const newResults = [...analysisResults]
      const file = uploadedFiles[index]
      
      const randomScore = Math.floor(Math.random() * 30) + 70
      
      // Извлекаем имя файла без расширения для демонстрации
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
      const nameParts = fileNameWithoutExt.split('_')
      
      newResults[index] = {
        score: randomScore,
        firstName: nameParts[0] || 'Иван',
        lastName: nameParts[1] || 'Петров',
        position: 'Senior Frontend Developer',
        company: 'Технологическая компания',
        experience: '5 лет 3 месяца',
        skills: ['React', 'TypeScript', 'Redux', 'Node.js', 'GraphQL'],
        strengths: [
          'Опыт работы с современными фреймворками',
          'Хорошее знание TypeScript и архитектурных паттернов',
          'Навыки командной работы и коммуникации'
        ],
        improvements: [
          'Не хватает опыта работы с GraphQL',
          'Рекомендуется добавить раздел с пет-проектами',
          'Можно улучшить описание достижений'
        ].slice(0, Math.floor(Math.random() * 2) + 2)
      }
      
      setAnalysisResults(newResults)
      setIsAnalyzing(false)
    }, 1500)
  }

  // Обработчик нажатия на телефон (заглушка)
  const handlePhoneClick = (e) => {
    e.stopPropagation()
    alert('Функция звонка будет доступна в следующей версии')
  }

  // Подсчет количества непроанализированных файлов
  const unanalyzedCount = uploadedFiles.filter((_, index) => !analysisResults[index]).length

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Проверить резюме</h1>
      </div>
      
      <div className="check-resume-content">
        <p className="resume-description">
          Загрузите резюме для анализа (до {maxFiles} файлов)
        </p>
        
        {/* Блок загрузки */}
        <div 
          className={`upload-area ${dragActive ? 'drag-active' : ''} ${uploadedFiles.length >= maxFiles ? 'upload-area-disabled' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => uploadedFiles.length < maxFiles && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            className="file-input"
            multiple
            disabled={uploadedFiles.length >= maxFiles}
          />
          <Upload size={40} className="upload-icon" />
          <div className="upload-text">
            <span className="upload-text-main">
              {uploadedFiles.length >= maxFiles 
                ? `Достигнут лимит (${maxFiles} файлов)` 
                : 'Перетащите файлы сюда'}
            </span>
            <span className="upload-text-secondary">
              {uploadedFiles.length >= maxFiles 
                ? 'Удалите некоторые файлы для загрузки новых' 
                : 'или нажмите для выбора файлов'}
            </span>
            <span className="upload-text-hint">
              PDF, DOC, DOCX до 5 MB • Загружено: {uploadedFiles.length}/{maxFiles}
            </span>
          </div>
        </div>

        {/* Кнопка анализа (показываем только если есть файлы для анализа) */}
        {uploadedFiles.length > 0 && unanalyzedCount > 0 && (
          <button 
            className={`analyze-button active`}
            onClick={handleAnalyzeAll}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <span>Анализ... ({unanalyzedCount} файлов)</span>
              </>
            ) : (
              `Проверить резюме (${unanalyzedCount})`
            )}
          </button>
        )}

        {/* Список загруженных файлов */}
        {uploadedFiles.length > 0 && (
          <div className="files-list">
            <div className="files-list-header">
              <h3 className="files-list-title">Загруженные файлы</h3>
              <button className="remove-all-btn" onClick={removeAllFiles} title="Удалить все">
                <Trash2 size={18} />
              </button>
            </div>
            
            {uploadedFiles.map((file, index) => {
              const isExpanded = expandedFileId === file.id;
              const hasAnalysis = analysisResults[index];
              const isAnalyzingThis = isAnalyzing && !hasAnalysis;
              
              return (
                <div key={file.id} className="file-item-wrapper">
                  {/* Блок с информацией о файле (кликабельный) */}
                  <div 
                    className={`file-info-block ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleExpand(file.id)}
                  >
                    <div className="file-info">
                      <FileText size={24} className="file-icon" />
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">
                          <span className="file-size">{file.size}</span>
                          {hasAnalysis && (
                            <span className="file-score">Оценка: {analysisResults[index].score}</span>
                          )}
                          {!hasAnalysis && !isAnalyzingThis && (
                            <span className="file-score not-analyzed">Не проанализировано</span>
                          )}
                        </div>
                      </div>
                      <button className="file-remove" onClick={(e) => removeFile(file.id, e)}>
                        <X size={18} />
                      </button>
                      <div className="expand-icon">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                    
                    {/* Превью анализа (показываем только если есть результаты и блок свернут) */}
                    {hasAnalysis && !isExpanded && (
                      <div className="file-analysis-preview">
                        <div className="preview-score">
                          <CheckCircle size={14} className="preview-icon" />
                          <span>Сильные стороны: {analysisResults[index].strengths.length}</span>
                        </div>
                        <div className="preview-score">
                          <TrendingUp size={14} className="preview-icon" />
                          <span>Рекомендации: {analysisResults[index].improvements.length}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Разворачивающийся блок с анализом */}
                  {isExpanded && hasAnalysis && (
                    <div className="expandable-analysis">
                      <div className="analysis-block">
                        <div className="analysis-header">
                          <div className="analysis-title-wrapper">
                            <span className="analysis-title">Анализ резюме</span>
                          </div>
                          <div className="analysis-score">
                            <span className="score-value">{analysisResults[index].score}</span>
                            <span className="score-total">/100</span>
                          </div>
                        </div>

                        {/* Информация о кандидате */}
                        <div className="candidate-info-section">
                          <div className="candidate-info-header">
                            <div className="candidate-info-initials">
                              {analysisResults[index].firstName[0]}
                            </div>
                            <div className="candidate-info-name">
                              <div className="candidate-info-fullname">
                                {analysisResults[index].firstName} {analysisResults[index].lastName}
                              </div>
                              <div className="candidate-info-position">
                                {analysisResults[index].position}
                              </div>
                            </div>
                          </div>

                          <div className="candidate-info-details">
                            <div className="candidate-info-item">
                              <svg className="candidate-info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6H16V4C16 2.89 15.11 2 14 2H10C8.89 2 8 2.89 8 4V6H4C2.89 6 2.01 6.89 2.01 8L2 19C2 20.11 2.89 21 4 21H20C21.11 21 22 20.11 22 19V8C22 6.89 21.11 6 20 6ZM14 6H10V4H14V6Z" fill="#229ED9"/>
                              </svg>
                              <span className="candidate-info-text">{analysisResults[index].company}</span>
                            </div>
                            
                            <div className="candidate-info-item">
                              <svg className="candidate-info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12 6C10.9 6 10 6.9 10 8C10 9.1 10.9 10 12 10C13.1 10 14 9.1 14 8C14 6.9 13.1 6 12 6ZM16 13V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V13C8 11.9 8.9 11 10 11H14C15.1 11 16 11.9 16 13Z" fill="#229ED9"/>
                              </svg>
                              <span className="candidate-info-text">{analysisResults[index].experience}</span>
                            </div>
                          </div>

                          <div className="candidate-info-skills">
                            {analysisResults[index].skills.slice(0, 5).map((skill, idx) => (
                              <span key={idx} className="candidate-info-skill-tag">{skill}</span>
                            ))}
                          </div>
                        </div>

                        {/* Сильные стороны */}
                        <div className="analysis-section strengths">
                          <div className="section-header">
                            <CheckCircle size={20} className="section-icon" />
                            <span className="section-title">Сильные стороны</span>
                          </div>
                          <ul className="section-list">
                            {analysisResults[index].strengths.map((item, idx) => (
                              <li key={idx} className="section-item">
                                <ThumbsUp size={16} className="item-icon" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Что улучшить */}
                        <div className="analysis-section improvements">
                          <div className="section-header">
                            <AlertCircle size={20} className="section-icon" />
                            <span className="section-title">Что улучшить</span>
                          </div>
                          <ul className="section-list">
                            {analysisResults[index].improvements.map((item, idx) => (
                              <li key={idx} className="section-item">
                                <TrendingUp size={16} className="item-icon" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Кнопка звонка кандидату */}
                        <button 
                          className="analysis-call-btn"
                          onClick={handlePhoneClick}
                        >
                          <Phone size={18} />
                          <span>Позвонить кандидату</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default CheckResume