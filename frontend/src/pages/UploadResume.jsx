import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Upload, 
  FileText, 
  Loader,
  X,
  AlertCircle,
  Trash2
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import './UploadResume.css'

const UploadResume = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user } = useAuth()
  
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Допустимые форматы файлов
  const allowedFormats = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
  const maxSize = 10 * 1024 * 1024 // 10 MB

  // Функция загрузки резюме с useCallback
  const loadResumes = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Передаем ID пользователя для получения только его активных резюме
      const data = await api.getResumes(user?.id)
      console.log('Загруженные резюме:', data)
      setUploadedFiles(data.resumes || [])
    } catch (error) {
      console.error('Error loading resumes:', error)
      setError('Не удалось загрузить список резюме. Проверьте подключение к серверу.')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id]) // Зависимость от user.id

  // Загружаем список резюме при монтировании и при изменении пользователя
  useEffect(() => {
    loadResumes()
  }, [loadResumes]) // Зависимость от loadResumes

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' Б'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
  }

  const formatDateTime = (dateString) => {
    try {
      const date = new Date(dateString)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const timeStr = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })

      if (date.toDateString() === today.toDateString()) {
        return `Сегодня в ${timeStr}`
      } else if (date.toDateString() === yesterday.toDateString()) {
        return `Вчера в ${timeStr}`
      } else {
        const dateStr = date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
        return `${dateStr} в ${timeStr}`
      }
    } catch {
      return 'Дата неизвестна'
    }
  }

  const handleFileSelect = async (file) => {
    setError(null)
    
    // Проверка формата
    if (!allowedFormats.includes(file.type)) {
      setError(`Неподдерживаемый формат файла. Разрешены: PDF, DOC, DOCX`)
      return
    }

    // Проверка размера
    if (file.size > maxSize) {
      setError(`Файл слишком большой. Максимальный размер: 10 МБ`)
      return
    }

    setIsUploading(true)
    
    try {
      console.log('Загрузка файла:', file.name)
      const response = await api.uploadResume(file, user)
      
      console.log('Файл загружен:', response)
      
      const newFile = {
        id: response.id,
        name: response.file_name,
        size: formatFileSize(response.file_size),
        rawSize: response.file_size,
        uploadDate: response.upload_date,
        file_type: response.file_type,
        user_id: user?.id
      }
      
      setUploadedFiles(prev => [newFile, ...prev])
      
    } catch (error) {
      console.error('Upload error:', error)
      
      if (error.response) {
        setError(`Ошибка сервера: ${error.response.status} - ${error.response.data?.error || 'Неизвестная ошибка'}`)
      } else if (error.request) {
        setError('Сервер не отвечает. Проверьте, запущен ли бэкенд.')
      } else {
        setError(`Ошибка при загрузке: ${error.message}`)
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        handleFileSelect(file)
      })
      e.target.value = ''
    }
  }

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
      Array.from(e.dataTransfer.files).forEach(file => {
        handleFileSelect(file)
      })
    }
  }

  // Удаление резюме
  const handleDeleteResume = async (e, resume) => {
    e.stopPropagation() // Предотвращаем открытие файла
    
    if (!window.confirm(`Вы уверены, что хотите удалить резюме "${resume.name}"?`)) {
      return
    }
    
    setDeletingId(resume.id)
    setError(null)
    
    try {
      await api.deleteResume(resume.id)
      
      // Удаляем из локального состояния
      setUploadedFiles(prev => prev.filter(f => f.id !== resume.id))
      
      console.log('Резюме удалено:', resume.id)
    } catch (error) {
      console.error('Error deleting resume:', error)
      setError('Не удалось удалить резюме. Попробуйте позже.')
    } finally {
      setDeletingId(null)
    }
  }

  // Открытие файла для просмотра
  const handleViewResume = (resume) => {
    try {
      const viewUrl = `http://localhost:3001/api/resumes/${resume.id}/view`
      console.log('Открытие файла:', viewUrl)
      window.open(viewUrl, '_blank')
    } catch (error) {
      console.error('Error viewing resume:', error)
      setError('Не удалось открыть резюме')
    }
  }

  // Определение иконки в зависимости от расширения файла
  const getFileIcon = (fileName, fileType) => {
    const extension = fileName?.split('.').pop()?.toLowerCase()
    
    // Ярко-синий цвет для иконки
    if (extension === 'pdf' || fileType?.includes('pdf')) {
      return <FileText size={24} className="file-icon pdf" style={{ color: '#229ED9' }} />
    } else if (extension === 'doc' || extension === 'docx' || fileType?.includes('word') || fileType?.includes('document')) {
      return <FileText size={24} className="file-icon word" style={{ color: '#229ED9' }} />
    }
    return <FileText size={24} className="file-icon" style={{ color: '#229ED9' }} />
  }

  // Получение расширения файла для отображения
  const getFileExtension = (fileName) => {
    return fileName?.split('.').pop()?.toUpperCase() || ''
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="back-button" onClick={() => navigate('/')}>←</button>
          <h1 className="page-title">Загрузить резюме</h1>
        </div>
        <div className="loading-container">
          <Loader size={48} className="spinning" />
          <p>Загрузка резюме...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>←</button>
        <h1 className="page-title">Загрузить резюме</h1>
      </div>
      
      <div className="upload-resume-content">
        {error && (
          <div className="error-message">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button className="error-close" onClick={() => setError(null)}>×</button>
          </div>
        )}
        
        <p className="upload-description">
          Загрузите резюме в систему
        </p>
        
        {/* Область загрузки */}
        <div 
          className={`upload-area ${dragActive ? 'drag-active' : ''} ${isUploading ? 'uploading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            className="file-input"
            multiple
            disabled={isUploading}
          />
          {isUploading ? (
            <>
              <Loader size={48} className="upload-icon spinning" />
              <div className="upload-text">
                <span className="upload-text-main">Загрузка...</span>
                <span className="upload-text-secondary">Пожалуйста, подождите</span>
              </div>
            </>
          ) : (
            <>
              <Upload size={48} className="upload-icon" style={{ color: '#229ED9' }} />
              <div className="upload-text">
                <span className="upload-text-main">Перетащите файлы сюда</span>
                <span className="upload-text-secondary">или нажмите для выбора файлов</span>
                <span className="upload-text-hint">
                  PDF, DOC, DOCX до 10 МБ
                </span>
              </div>
            </>
          )}
        </div>

        {/* Список загруженных резюме */}
        {uploadedFiles.length > 0 ? (
          <div className="uploaded-files-list">
            <div className="files-list-header">
              <h3 className="files-list-title">Загруженные резюме</h3>
              <span className="files-count">{uploadedFiles.length}</span>
            </div>
            
            <div className="files-list">
              {uploadedFiles.map((file) => (
                <div 
                  key={file.id} 
                  className="file-item"
                  title={`Нажмите чтобы открыть: ${file.name}`}
                >
                  <div 
                    className="file-clickable-area"
                    onClick={() => handleViewResume(file)}
                  >
                    <div className="file-icon-container">
                      {getFileIcon(file.name, file.file_type)}
                    </div>
                    <div className="file-details">
                      <div className="file-name">
                        {file.name}
                        <span className="file-extension">{getFileExtension(file.name)}</span>
                      </div>
                      <div className="file-metadata">
                        <span className="file-size">{file.size || formatFileSize(file.file_size)}</span>
                        <span className="file-date">{formatDateTime(file.upload_date || file.uploadDate)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Кнопка удаления */}
                  <button 
                    className="file-delete-btn"
                    onClick={(e) => handleDeleteResume(e, file)}
                    disabled={deletingId === file.id}
                    title="Удалить резюме"
                  >
                    {deletingId === file.id ? (
                      <Loader size={18} className="spinning" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          !isUploading && (
            <div className="empty-files">
              <FileText size={48} className="empty-icon" style={{ color: '#229ED9', opacity: 0.5 }} />
              <p>Нет загруженных резюме</p>
              <span className="empty-hint">
                Загрузите резюме, чтобы начать работу
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default UploadResume