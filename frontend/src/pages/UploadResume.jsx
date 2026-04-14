import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Upload, 
  FileText, 
  Loader,
  AlertCircle,
  Trash2
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useResumes } from '../hooks/useResumes'
import { useUI } from '../hooks/useUI'
import { api } from '../services/api'
import { cachePersonalData } from '../utils/personalDataCache'
import { parseResumeFile } from '../utils/resumeParser'
import ResumeCard from '../components/ResumeCard'
import './UploadResume.css'

const UploadResume = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user } = useAuth()
  const { 
    items: uploadedFiles, 
    isLoading, 
    loadResumes, 
    deleteResume: deleteResumeAction 
  } = useResumes()
  const { showNotification } = useUI()
  
  const [dragActive, setDragActive] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [parsingStatus, setParsingStatus] = useState(null)

  const allowedFormats = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
  const maxSize = 10 * 1024 * 1024

  useEffect(() => {
    if (user?.id) {
      loadResumes(user.id)
    }
  }, [loadResumes, user?.id])

  const handleFileSelect = async (file) => {
    setLocalError(null)
    setParsingStatus(null)
    
    if (!allowedFormats.includes(file.type)) {
      setLocalError(`Неподдерживаемый формат файла. Разрешены: PDF, DOC, DOCX`)
      return
    }

    if (file.size > maxSize) {
      setLocalError(`Файл слишком большой. Максимальный размер: 10 МБ`)
      return
    }

    setIsUploading(true)
    setParsingStatus('parsing')
    
    try {
      const parsedData = await parseResumeFile(file)
      setParsingStatus('uploading')
      
      const response = await api.uploadResume(file, user)
      
      if (response.candidate?.uuid || response.candidate_uuid) {
        const candidateUuid = response.candidate?.uuid || response.candidate_uuid
        cachePersonalData(candidateUuid, {
          first_name: parsedData.first_name,
          last_name: parsedData.last_name,
          full_name: parsedData.full_name,
          email: parsedData.email,
          phone: parsedData.phone
        })
      }
      
      // Перезагружаем список через Redux
      await loadResumes(user?.id)
      showNotification('Резюме успешно загружено', 'success')
      
    } catch (error) {
      console.error('Upload error:', error)
      if (error.response) {
        setLocalError(`Ошибка сервера: ${error.response.status}`)
      } else if (error.request) {
        setLocalError('Сервер не отвечает. Проверьте, запущен ли бэкенд.')
      } else {
        setLocalError(`Ошибка при загрузке: ${error.message}`)
      }
    } finally {
      setIsUploading(false)
      setParsingStatus(null)
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => handleFileSelect(file))
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
      Array.from(e.dataTransfer.files).forEach(file => handleFileSelect(file))
    }
  }

  const handleDeleteResume = async (e, resume) => {
    e.stopPropagation()
    if (!window.confirm(`Вы уверены, что хотите удалить резюме "${resume.name}"?`)) return
    
    setDeletingId(resume.id)
    try {
      await deleteResumeAction(resume.id)
      showNotification('Резюме удалено', 'info')
    } catch (error) {
      setLocalError('Не удалось удалить резюме.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleViewResume = (resume) => {
    const viewUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/resumes/${resume.id}/view`
    window.open(viewUrl, '_blank')
  }

  const getParsingStatusText = () => {
    if (parsingStatus === 'parsing') return 'Извлечение данных...'
    if (parsingStatus === 'uploading') return 'Загрузка на сервер...'
    return 'Загрузка...'
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
        {localError && (
          <div className="error-message">
            <AlertCircle size={18} />
            <span>{localError}</span>
            <button className="error-close" onClick={() => setLocalError(null)}>×</button>
          </div>
        )}
        
        <p className="upload-description">
          Загрузите резюме в систему
        </p>
        
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
                <span className="upload-text-main">{getParsingStatusText()}</span>
                <span className="upload-text-secondary">Пожалуйста, подождите</span>
              </div>
            </>
          ) : (
            <>
              <Upload size={48} className="upload-icon" style={{ color: '#229ED9' }} />
              <div className="upload-text">
                <span className="upload-text-main">Перетащите файлы сюда</span>
                <span className="upload-text-secondary">или нажмите для выбора</span>
                <span className="upload-text-hint">PDF, DOC, DOCX до 10 МБ</span>
              </div>
            </>
          )}
        </div>

        {uploadedFiles.length > 0 ? (
          <div className="uploaded-files-list">
            <div className="files-list-header">
              <h3 className="files-list-title">Загруженные резюме</h3>
              <span className="files-count">{uploadedFiles.length}</span>
            </div>
            
            <div className="files-list">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="file-item-wrapper">
                  <div className="file-card-clickable" onClick={() => handleViewResume(file)}>
                    <ResumeCard 
                      resume={file}
                      showCheckbox={false}
                      selected={false}
                    />
                  </div>
                  <button 
                    className="file-delete-btn-overlay"
                    onClick={(e) => handleDeleteResume(e, file)}
                    disabled={deletingId === file.id}
                    title="Удалить резюме"
                  >
                    {deletingId === file.id ? (
                      <Loader size={16} className="spinning" />
                    ) : (
                      <Trash2 size={16} />
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
              <span className="empty-hint">Загрузите резюме, чтобы начать работу</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default UploadResume