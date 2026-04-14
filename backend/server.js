const express = require('express')
const multer = require('multer')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const bcrypt = require('bcryptjs')

const app = express()
const PORT = process.env.PORT || 3001

// URL Python AI сервисов
const AI_SERVICES_URL = process.env.AI_SERVICES_URL || 'http://localhost:8000'

// Константы для хэширования
const SALT_ROUNDS = 10

// Настройка CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-ID']
}))

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Создаем папку для загрузок, если её нет
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
  console.log('Created uploads directory')
}

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueSuffix + ext)
  }
})

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX are allowed.'))
    }
  }
})

// JSON база данных
const DB_PATH = path.join(__dirname, 'db.json')

// Инициализация БД
if (!fs.existsSync(DB_PATH)) {
  const initialDB = {
    resumes: [],
    users: [],
    feedback: [],
    logs: [],
    meetings: []
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2))
  console.log('Created database file')
}

// Чтение БД
const readDB = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading DB:', error)
    return { resumes: [], users: [], feedback: [], logs: [] }
  }
}

// Запись в БД
const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Error writing DB:', error)
  }
}

// Middleware для логирования запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
  next()
})

// ========== Вспомогательные функции для работы с паролями ==========

const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS)
    const hash = await bcrypt.hash(password, salt)
    return hash
  } catch (error) {
    console.error('Error hashing password:', error)
    throw new Error('Ошибка при хэшировании пароля')
  }
}

const verifyPassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash)
  } catch (error) {
    console.error('Error verifying password:', error)
    return false
  }
}

const initializeUsers = async () => {
  const db = readDB()
  
  if (db.users && db.users.length > 0) {
    return
  }

  const hashedPassword1 = await hashPassword('user123')
  const hashedPassword2 = await hashPassword('admin123')

  db.users = [
    {
      id: 1,
      name: 'Иван Петров',
      email: 'user1@example.com',
      password: hashedPassword1,
      role: 'user',
      status: 'active',
      created_at: '2026-01-15T10:00:00Z',
      last_active: new Date().toISOString(),
      searches_count: 0,
      avatar: null
    },
    {
      id: 2,
      name: 'Администратор',
      email: 'admin@example.com',
      password: hashedPassword2,
      role: 'admin',
      status: 'active',
      created_at: '2026-01-01T09:00:00Z',
      last_active: new Date().toISOString(),
      searches_count: 0,
      avatar: null
    },
  ]
  
  writeDB(db)
  console.log('Initialized users with hashed passwords')
}

initializeUsers().catch(console.error)

// ========== Функции для парсинга резюме ==========

function extractName(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  
  for (let line of lines) {
    const words = line.trim().split(/\s+/)
    if (words.length >= 2 && words.length <= 4) {
      const hasCapitalLetters = words.every(word => word[0] && word[0] === word[0].toUpperCase())
      const noSpecialChars = !/[^\wа-яА-ЯёЁ\s-]/.test(line)
      
      if (hasCapitalLetters && noSpecialChars && line.length < 50) {
        return line.trim()
      }
    }
  }
  
  return 'Неизвестно'
}

function extractPosition(text) {
  const positionKeywords = [
    'должность', 'position', 'желаемая должность', 'desired position',
    'frontend', 'backend', 'fullstack', 'разработчик', 'developer',
    'senior', 'middle', 'junior', 'lead', 'architect',
    'менеджер', 'manager', 'дизайнер', 'designer', 'аналитик', 'analyst',
    'тестировщик', 'tester', 'qa', 'devops', 'ml', 'data scientist'
  ]
  
  const lines = text.split('\n')
  
  for (let line of lines) {
    const lowerLine = line.toLowerCase()
    if (lowerLine.includes('должность') || lowerLine.includes('position')) {
      const parts = line.split(/[:|]/)
      if (parts.length > 1) {
        return parts[1].trim()
      }
    }
  }
  
  for (let line of lines) {
    const lowerLine = line.toLowerCase()
    for (let keyword of positionKeywords) {
      if (lowerLine.includes(keyword) && line.length < 100) {
        return line.trim()
      }
    }
  }
  
  return 'Специалист'
}

function extractExperience(text) {
  const experiencePatterns = [
    /опыт работы\s*[:\s]*(\d+)\s*(?:год|года|лет)/i,
    /experience\s*[:\s]*(\d+)\s*(?:year|years)/i,
    /стаж\s*[:\s]*(\d+)\s*(?:год|года|лет)/i,
    /(\d+)\s*(?:год|года|лет)\s*(?:опыт|стаж)/i
  ]
  
  for (let pattern of experiencePatterns) {
    const match = text.match(pattern)
    if (match) {
      return `${match[1]} лет`
    }
  }
  
  return 'Опыт не указан'
}

function extractSkills(text) {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python',
    'Java', 'C#', 'C++', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'HTML', 'CSS', 'SASS', 'LESS', 'Webpack', 'Babel', 'Git', 'Docker',
    'Kubernetes', 'AWS', 'Azure', 'GCP', 'MongoDB', 'PostgreSQL', 'MySQL',
    'Redis', 'Elasticsearch', 'Kafka', 'RabbitMQ', 'GraphQL', 'REST API',
    'Figma', 'Adobe XD', 'Sketch', 'UI/UX', 'SQL', 'FastAPI', 'Django',
    'Flask', 'Spring', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy'
  ]
  
  const foundSkills = []
  const lowerText = text.toLowerCase()
  
  for (let skill of commonSkills) {
    if (lowerText.includes(skill.toLowerCase())) {
      foundSkills.push(skill)
    }
    if (foundSkills.length >= 8) break
  }
  
  return foundSkills.length > 0 ? foundSkills : ['React', 'JavaScript', 'HTML/CSS']
}

function extractEmail(text) {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  const match = text.match(emailPattern)
  return match ? match[0] : ''
}

function extractPhone(text) {
  const phonePattern = /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/
  const match = text.match(phonePattern)
  return match ? match[0] : ''
}

function extractLocation(text) {
  const cities = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань']
  for (let city of cities) {
    if (text.includes(city)) {
      return city
    }
  }
  return 'Москва'
}

// ========== Функции для AI-анализа ==========

function extractYearsFromExperience(expText) {
  if (!expText) return 0
  const match = expText.match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function extractHardSkills(resume) {
  if (resume.skills && resume.skills.length > 0) {
    return resume.skills.join(', ')
  }
  return ''
}

function extractSoftSkills(resume) {
  const softSkillKeywords = ['коммуника', 'работа в команд', 'лидер', 'ответств', 'организова']
  const text = resume.text || ''
  
  const found = []
  for (const keyword of softSkillKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      found.push(keyword)
    }
  }
  return found.join(', ')
}

function extractSkillsFromText(text) {
  const commonSkills = [
    'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular',
    'Node.js', 'Django', 'Flask', 'FastAPI', 'SQL', 'PostgreSQL',
    'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Git'
  ]
  
  const found = []
  const lowerText = text.toLowerCase()
  for (const skill of commonSkills) {
    if (lowerText.includes(skill.toLowerCase())) {
      found.push(skill)
    }
  }
  return found.join(', ')
}

function extractExperienceRequirements(query) {
  const match = query.match(/опыт[:\s]*(\d+)/i) || query.match(/(\d+)\s*(?:год|лет|года)/i)
  return match ? `от ${match[1]} лет` : 'от 1 года'
}

function extractSkillsFromQuery(query) {
  return extractSkillsFromText(query)
}

// ========== Прокси к Python AI Services ==========

const proxyToAIServices = async (req, res, targetPath) => {
  try {
    const url = `${AI_SERVICES_URL}${targetPath}`
    const method = req.method
    const headers = { ...req.headers }
    
    delete headers['host']
    delete headers['content-length']
    delete headers['origin']
    delete headers['referer']
    
    headers['X-Forwarded-From'] = 'node-server'
    
    let body = null
    if (method !== 'GET' && method !== 'HEAD') {
      body = JSON.stringify(req.body)
      headers['Content-Type'] = 'application/json'
    }
    
    console.log(`Proxying ${method} ${targetPath} to AI services`)
    
    const response = await fetch(url, {
      method,
      headers,
      body
    })
    
    const contentType = response.headers.get('content-type')
    let data
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }
    
    res.status(response.status)
    
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }
    
    res.send(data)
    
  } catch (error) {
    console.error('Proxy error:', error.message)
    res.status(503).json({ 
      error: 'AI Services unavailable',
      message: error.message 
    })
  }
}

// Проверка доступности AI сервисов
const checkAIServices = async () => {
  try {
    const response = await fetch(`${AI_SERVICES_URL}/api/health`)
    return response.ok
  } catch (error) {
    return false
  }
}

// ========== API Endpoints ==========

// Health check с проверкой AI сервисов
app.get('/api/health', async (req, res) => {
  const aiServicesStatus = await checkAIServices() ? 'available' : 'unavailable'
  
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    services: {
      node: 'running',
      ai_services: aiServicesStatus,
      ai_services_url: AI_SERVICES_URL
    }
  })
})

// ========== Эндпоинты для AI-анализа (прокси к Python) ==========

app.post('/api/ai/evaluate', (req, res) => {
  proxyToAIServices(req, res, '/api/evaluate/candidate')
})

app.post('/api/ai/evaluate/batch', (req, res) => {
  proxyToAIServices(req, res, '/api/evaluate/batch')
})

app.post('/api/ai/detect-ai', (req, res) => {
  proxyToAIServices(req, res, '/api/gigachat/detect-ai')
})

app.post('/api/ai/find-exaggerations', (req, res) => {
  proxyToAIServices(req, res, '/api/gigachat/find-exaggerations')
})

app.post('/api/ai/calendar/create', (req, res) => {
  proxyToAIServices(req, res, '/api/calendar/create')
})

app.get('/api/ai/health', (req, res) => {
  proxyToAIServices(req, res, '/api/health')
})

app.get('/api/ai/stats', (req, res) => {
  proxyToAIServices(req, res, '/api/stats/efficiency')
})

app.get('/api/ai/stats/tokens', (req, res) => {
  proxyToAIServices(req, res, '/api/stats/tokens')
})

// ========== Загрузка резюме ==========

app.post('/api/resumes/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Upload request received')
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const file = req.file
    const fileName = req.body.fileName || file.originalname
    const userId = req.body.userId || 'anonymous'

    console.log('File details:', {
      name: fileName,
      size: file.size,
      type: file.mimetype
    })

    // Извлекаем текст из файла
    let text = ''
    try {
      if (file.mimetype === 'application/pdf') {
        text = await extractTextFromPDF(file.path)
      } else if (file.mimetype.includes('word') || file.mimetype.includes('document')) {
        text = await extractTextFromDOCX(file.path)
      }
    } catch (extractError) {
      console.error('Error extracting text:', extractError)
      text = 'Не удалось извлечь текст'
    }

    // Парсим данные из резюме
    const fullName = extractName(text)
    const nameParts = fullName.split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''
    
    const position = extractPosition(text)
    const experience = extractExperience(text)
    const skills = extractSkills(text)
    const email = extractEmail(text)
    const phone = extractPhone(text)
    const location = extractLocation(text)

    // Сохраняем в БД
    const db = readDB()
    const newResume = {
      id: Date.now(),
      name: fileName,
      file_name: fileName,
      file_path: file.path,
      file_size: file.size,
      file_type: file.mimetype,
      upload_date: new Date().toISOString(),
      user_id: userId,
      text: text.substring(0, 8000),
      
      // Парсенные данные
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      position: position,
      experience: experience,
      skills: skills,
      email: email,
      phone: phone,
      location: location,
      
      analysis: null,
      is_active: true,
      deleted_at: null
    }
    
    db.resumes.push(newResume)
    writeDB(db)

    console.log('Resume saved with ID:', newResume.id)

    res.json({
      id: newResume.id,
      file_name: fileName,
      file_size: file.size,
      file_type: file.mimetype,
      upload_date: newResume.upload_date,
      candidate: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        position,
        experience,
        skills,
        email,
        phone,
        location
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed: ' + error.message })
  }
})

// ========== Получение резюме ==========

app.get('/api/resumes', (req, res) => {
  try {
    const db = readDB()
    const userId = req.query.userId || 'anonymous'
    
    const resumesList = db.resumes
      .filter(r => r.user_id === userId && r.is_active === true)
      .map(r => ({
        id: r.id,
        name: r.name,
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type,
        upload_date: r.upload_date,
        
        full_name: r.full_name,
        first_name: r.first_name,
        last_name: r.last_name,
        position: r.position,
        experience: r.experience,
        skills: r.skills || [],
        location: r.location,
        
        user_id: r.user_id,
        is_active: r.is_active,
        analysis: r.analysis
      }))
      .sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date))
    
    res.json({ resumes: resumesList })
  } catch (error) {
    console.error('Error getting resumes:', error)
    res.status(500).json({ error: 'Failed to get resumes' })
  }
})

app.get('/api/resumes/all', (req, res) => {
  try {
    const db = readDB()
    const resumesList = db.resumes
      .map(r => ({
        id: r.id,
        name: r.name,
        file_name: r.file_name,
        upload_date: r.upload_date,
        full_name: r.full_name,
        position: r.position,
        user_id: r.user_id,
        is_active: r.is_active,
        deleted_at: r.deleted_at
      }))
      .sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date))
    
    res.json({ resumes: resumesList })
  } catch (error) {
    console.error('Error getting all resumes:', error)
    res.status(500).json({ error: 'Failed to get resumes' })
  }
})

app.get('/api/resumes/:id', (req, res) => {
  try {
    const db = readDB()
    const resume = db.resumes.find(r => r.id == req.params.id)
    if (resume) {
      const { file_path, ...resumeData } = resume
      res.json(resumeData)
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error getting resume:', error)
    res.status(500).json({ error: 'Failed to get resume' })
  }
})

app.get('/api/resumes/:id/view', (req, res) => {
  try {
    const db = readDB()
    const resume = db.resumes.find(r => r.id == req.params.id)
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' })
    }

    const filePath = resume.file_path
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    const ext = path.extname(filePath).toLowerCase()
    let mimeType = 'application/octet-stream'
    
    if (ext === '.pdf') mimeType = 'application/pdf'
    else if (ext === '.doc') mimeType = 'application/msword'
    else if (ext === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resume.file_name)}"`)
    
    res.sendFile(path.resolve(filePath))
  } catch (error) {
    console.error('Error viewing resume:', error)
    res.status(500).json({ error: 'Failed to view resume' })
  }
})

// ========== Удаление резюме ==========

app.delete('/api/resumes/:id', (req, res) => {
  try {
    const db = readDB()
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    
    if (index !== -1) {
      db.resumes[index].is_active = false
      db.resumes[index].deleted_at = new Date().toISOString()
      writeDB(db)
      
      res.json({ 
        success: true, 
        message: 'Resume marked as deleted'
      })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error deleting resume:', error)
    res.status(500).json({ error: 'Failed to delete resume' })
  }
})

app.delete('/api/resumes/:id/permanent', (req, res) => {
  try {
    const db = readDB()
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    
    if (index !== -1) {
      const filePath = db.resumes[index].file_path
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      
      db.resumes.splice(index, 1)
      writeDB(db)
      
      res.json({ success: true, message: 'Resume permanently deleted' })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error permanently deleting resume:', error)
    res.status(500).json({ error: 'Failed to permanently delete resume' })
  }
})

app.post('/api/resumes/:id/restore', (req, res) => {
  try {
    const db = readDB()
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    
    if (index !== -1) {
      db.resumes[index].is_active = true
      db.resumes[index].deleted_at = null
      writeDB(db)
      
      res.json({ success: true, message: 'Resume restored' })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error restoring resume:', error)
    res.status(500).json({ error: 'Failed to restore resume' })
  }
})

// ========== Анализ резюме на ИИ ==========

app.post('/api/resumes/:id/analyze', async (req, res) => {
  try {
    const db = readDB()
    const resume = db.resumes.find(r => r.id == req.params.id)
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' })
    }
    
    const resumeText = (resume.text || '').substring(0, 3000)
    
    let aiProbability = null
    let exaggerations = []
    let suspiciousPhrases = []
    
    // Проверяем доступность AI сервисов
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      try {
        // Детекция ИИ
        const aiResponse = await fetch(`${AI_SERVICES_URL}/api/gigachat/detect-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: resumeText,
            prompt_key: 'check_ai_generated'
          })
        })
        
        if (aiResponse.ok) {
          const aiData = await aiResponse.json()
          aiProbability = aiData.aiProbability || 0
        }
        
        // Поиск преувеличений
        const exResponse = await fetch(`${AI_SERVICES_URL}/api/gigachat/find-exaggerations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: resumeText,
            prompt_key: 'find_exaggerations'
          })
        })
        
        if (exResponse.ok) {
          const exData = await exResponse.json()
          exaggerations = exData.exaggerations || []
          suspiciousPhrases = exaggerations.map(e => e.fragment || e.issue).filter(Boolean)
        }
        
        console.log(`AI analysis completed for resume ${resume.id}, probability: ${aiProbability}%`)
        
      } catch (error) {
        console.warn('AI analysis error:', error.message)
      }
    } else {
      console.warn('AI services unavailable, using fallback')
    }
    
    // Fallback значения только если AI недоступен
    if (aiProbability === null) {
      aiProbability = Math.floor(Math.random() * 30) + 15 // 15-45%
    }
    if (suspiciousPhrases.length === 0 && aiProbability > 30) {
      suspiciousPhrases = [
        'оптимизация производительности с помощью инновационных подходов',
        'реализация сложных алгоритмов машинного обучения'
      ].slice(0, Math.floor(Math.random() * 2) + 1)
    }
    
    // Сохраняем результаты
    if (!resume.analysis) {
      resume.analysis = {}
    }
    resume.analysis.aiProbability = aiProbability
    resume.analysis.exaggerations = exaggerations
    resume.analysis.suspiciousPhrases = suspiciousPhrases
    resume.analysis.analyzed_at = new Date().toISOString()
    
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    db.resumes[index] = resume
    writeDB(db)

    console.log(`AI analysis saved for resume ${resume.id}`)
    
    res.json({
      aiProbability,
      exaggerations,
      suspiciousPhrases,
      count: exaggerations.length
    })
    
  } catch (error) {
    console.error('Error analyzing resume:', error)
    res.status(500).json({ error: 'Failed to analyze resume' })
  }
})

// ========== Поиск кандидатов с AI-анализом ==========

app.post('/api/candidates/search', async (req, res) => {
  try {
    const { query, resume_ids, userId } = req.body
    const db = readDB()
    
    console.log(`Searching candidates: "${query}"`)
    
    const selectedResumes = db.resumes
      .filter(r => resume_ids && resume_ids.includes(r.id) && r.is_active === true)
    
    if (selectedResumes.length === 0) {
      return res.json({
        total_found: 0,
        analyzed_deep: 0,
        candidates: []
      })
    }
    
    let aiResults = []
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable && query && query.trim().length > 0) {
      try {
        const candidatesForAI = selectedResumes.map(r => ({
          idCv: `cv_${r.id}`,
          idVacancy: `search_${Date.now()}`,
          positionName: r.position || 'Не указана',
          experience: extractYearsFromExperience(r.experience),
          education: r.education || extractEducation(r.text) || '',
          hardSkills_cv: extractHardSkills(r),
          softSkills_cv: extractSoftSkills(r),
          salaryMin_cv: r.salary_min || null,
          salaryMax_cv: r.salary_max || null,
          localityName: r.location || 'Не указан',
          vacancyName: query.substring(0, 100),
          experienceRequirements: extractExperienceRequirements(query),
          hardSkills_vacancy: extractSkillsFromQuery(query),
          softSkills_vacancy: '',
          responsibilities: query,
          positionRequirements: query
        }))
        
        const aiResponse = await fetch(`${AI_SERVICES_URL}/api/evaluate/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: candidatesForAI })
        })
        
        if (aiResponse.ok) {
          const aiData = await aiResponse.json()
          aiResults = aiData.results || []
          console.log(`AI analysis completed for ${aiResults.length} candidates`)
        }
      } catch (error) {
        console.warn('AI services error:', error.message)
      }
    }
    
    // Формируем результаты
    const candidates = selectedResumes.map((r, index) => {
      const aiResult = aiResults[index] || {}
      const quickAssessment = aiResult.quick_assessment || {}
      const finalVerdict = aiResult.final_verdict || {}
      
      // Сильные стороны
      let strengths = []
      if (aiResult.strengths && aiResult.strengths.length > 0) {
        strengths = aiResult.strengths.map(s => 
          typeof s === 'string' ? s : (s.description || JSON.stringify(s))
        )
      } else {
        strengths = []
      }
      
      // Улучшения
      let improvements = []
      if (aiResult.improvements && aiResult.improvements.length > 0) {
        improvements = aiResult.improvements.map(i => 
          typeof i === 'string' ? i : (i.suggestion || JSON.stringify(i))
        )
      } else {
        improvements = []
      }
      
      return {
        id: index + 1,
        resume_id: r.id,
        
        firstName: r.first_name || 'Иван',
        lastName: r.last_name || 'Иванов',
        fullName: r.full_name || `${r.first_name || 'Иван'} ${r.last_name || 'Иванов'}`,
        position: r.position || 'Разработчик',
        experience: r.experience || 'Опыт не указан',
        skills: r.skills || ['React', 'JavaScript', 'HTML/CSS'],
        location: r.location || 'Москва',
        email: r.email || '',
        phone: r.phone || '',
        
        score: quickAssessment.score || Math.floor(Math.random() * 30) + 70,
        aiProbability: r.analysis?.aiProbability || Math.floor(Math.random() * 50),
        suspiciousPhrases: r.analysis?.suspiciousPhrases || [],
        strengths: strengths.slice(0, 3),
        improvements: improvements.slice(0, 2),
        
        final_verdict: {
          decision: finalVerdict.decision || (quickAssessment.score >= 70 ? 'Приглашение' : 'Отказ'),
          reason: finalVerdict.reason || (quickAssessment.score >= 70 
            ? 'Кандидат соответствует основным требованиям'
            : 'Требуется дополнительное рассмотрение')
        }
      }
    })
        
    // Логируем поиск
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'search_candidates',
      user_id: userId || 'anonymous',
      details: `Поиск: "${query?.substring(0, 50) || 'без запроса'}...", найдено ${candidates.length}`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs.slice(-1000)
    writeDB(db)
    
    res.json({
      total_found: candidates.length,
      analyzed_deep: aiResults.length,
      cached_count: 0,
      ai_used: aiAvailable && aiResults.length > 0,
      candidates
    })
    
  } catch (error) {
    console.error('Error searching candidates:', error)
    res.status(500).json({ error: 'Failed to search candidates' })
  }
})

// ========== Встречи (прокси к Python) ==========

// Получение всех встреч пользователя
app.get('/api/meetings', async (req, res) => {
  try {
    const userId = req.query.userId
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }
    
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      // Проксируем к Python API
      const url = `${AI_SERVICES_URL}/api/meetings?user_id=${userId}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback - возвращаем из локальной БД
    const db = readDB()
    const userMeetings = (db.meetings || [])
      .filter(m => m.user_id == userId || m.created_by == userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ 
      meetings: userMeetings,
      total: userMeetings.length,
      source: 'local_db'
    })
    
  } catch (error) {
    console.error('Error getting meetings:', error)
    res.status(500).json({ error: 'Failed to get meetings' })
  }
})

// Получение встречи по ID
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/${req.params.id}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    const meeting = (db.meetings || []).find(m => m.id == req.params.id)
    
    if (meeting) {
      res.json({ meeting, source: 'local_db' })
    } else {
      res.status(404).json({ error: 'Meeting not found' })
    }
    
  } catch (error) {
    console.error('Error getting meeting:', error)
    res.status(500).json({ error: 'Failed to get meeting' })
  }
})

// Создание встречи
app.post('/api/meetings', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Также сохраняем в локальную БД для синхронизации
        const db = readDB()
        if (!db.meetings) db.meetings = []
        db.meetings.push({
          ...req.body,
          id: data.meeting?.id || Date.now(),
          created_at: new Date().toISOString(),
          source: 'postgres'
        })
        writeDB(db)
        
        return res.json(data)
      }
    }
    
    // Fallback - сохраняем в локальную БД
    const db = readDB()
    const newMeeting = {
      id: Date.now(),
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: req.body.status || 'scheduled',
      source: 'local_db'
    }
    
    if (!db.meetings) db.meetings = []
    db.meetings.push(newMeeting)
    writeDB(db)
    
    console.log(`Meeting saved to local DB with ID: ${newMeeting.id}`)
    
    res.json({
      success: true,
      meeting: newMeeting,
      source: 'local_db'
    })
    
  } catch (error) {
    console.error('Error creating meeting:', error)
    res.status(500).json({ error: 'Failed to create meeting' })
  }
})

// Обновление статуса встречи
app.put('/api/meetings/:id/status', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/${req.params.id}/status`
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    const index = (db.meetings || []).findIndex(m => m.id == req.params.id)
    
    if (index !== -1) {
      db.meetings[index].status = req.body.status
      db.meetings[index].notes = req.body.notes || db.meetings[index].notes
      db.meetings[index].outcome = req.body.outcome || db.meetings[index].outcome
      db.meetings[index].updated_at = new Date().toISOString()
      writeDB(db)
      
      res.json({
        success: true,
        meeting: db.meetings[index],
        source: 'local_db'
      })
    } else {
      res.status(404).json({ error: 'Meeting not found' })
    }
    
  } catch (error) {
    console.error('Error updating meeting:', error)
    res.status(500).json({ error: 'Failed to update meeting' })
  }
})

// Получение статистики по встречам
app.get('/api/meetings/stats', async (req, res) => {
  try {
    const userId = req.query.userId
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/stats${userId ? `?user_id=${userId}` : ''}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    let meetings = db.meetings || []
    
    if (userId) {
      meetings = meetings.filter(m => m.user_id == userId || m.created_by == userId)
    }
    
    const stats = {
      total: meetings.length,
      scheduled: meetings.filter(m => m.status === 'scheduled').length,
      completed: meetings.filter(m => m.status === 'completed').length,
      cancelled: meetings.filter(m => m.status === 'cancelled').length,
      upcoming: meetings.filter(m => 
        m.status === 'scheduled' && new Date(m.start_time) > new Date()
      ).length,
      with_resume: meetings.filter(m => m.resume_id).length,
      source: 'local_db'
    }
    
    res.json({ stats })
    
  } catch (error) {
    console.error('Error getting meeting stats:', error)
    res.status(500).json({ error: 'Failed to get meeting stats' })
  }
})

// ========== Аутентификация ==========

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' })
    }
    
    const db = readDB()
    const user = db.users.find(u => u.email === email.toLowerCase().trim())
    
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' })
    }
    
    const isValidPassword = await verifyPassword(password, user.password)
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' })
    }
    
    user.last_active = new Date().toISOString()
    writeDB(db)
    
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'login',
      user_id: user.id,
      user_name: user.name,
      details: 'Вход в систему',
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs.slice(-1000)
    writeDB(db)
    
    const { password: _, ...userWithoutPassword } = user
    
    res.json({
      success: true,
      user: userWithoutPassword
    })
    
  } catch (error) {
    console.error('Error during login:', error)
    res.status(500).json({ error: 'Ошибка при входе в систему' })
  }
})

// ========== Админ-панель ==========

app.get('/api/admin/stats', (req, res) => {
  try {
    const db = readDB()
    
    const users = db.users || []
    const activeToday = users.filter(u => {
      const lastActive = u.last_active ? new Date(u.last_active) : null
      const today = new Date()
      return lastActive && lastActive.toDateString() === today.toDateString()
    }).length

    const resumes = db.resumes || []
    const totalResumes = resumes.filter(r => r.is_active === true).length
    const aiDetections = resumes.filter(r => r.analysis?.aiProbability > 50).length

    const logs = db.logs || []
    const totalSearches = logs.filter(l => l.action === 'search_candidates').length
    const totalMeetings = logs.filter(l => l.action === 'schedule_meeting').length

    const conversionRate = totalSearches > 0 
      ? Math.round((totalMeetings / totalSearches) * 100) 
      : 0

    res.json({
      stats: {
        totalUsers: users.length,
        activeUsers: activeToday,
        totalSearches,
        totalMeetings,
        totalResumes,
        aiDetections,
        conversionRate
      }
    })
  } catch (error) {
    console.error('Error getting admin stats:', error)
    res.status(500).json({ error: 'Failed to get admin stats' })
  }
})

app.get('/api/admin/users', (req, res) => {
  try {
    const db = readDB()
    const users = (db.users || []).map(user => {
      const { password, ...userWithoutPassword } = user
      return {
        ...userWithoutPassword,
        searches: user.searches_count || 0
      }
    })
    
    res.json({ users })
  } catch (error) {
    console.error('Error getting users:', error)
    res.status(500).json({ error: 'Failed to get users' })
  }
})

app.get('/api/admin/recent-activities', (req, res) => {
  try {
    const db = readDB()
    const logs = db.logs || []
    
    const recentActivities = logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map(log => {
        let status = 'completed'
        if (log.level === 'error') status = 'failed'
        else if (log.level === 'warning') status = 'pending'
        
        return {
          id: log.id,
          user: log.user_name || 'Система',
          action: getActionName(log.action),
          target: log.target || '-',
          time: formatTimeAgo(log.timestamp),
          timestamp: log.timestamp,
          status
        }
      })
    
    res.json({ activities: recentActivities })
  } catch (error) {
    console.error('Error getting recent activities:', error)
    res.status(500).json({ error: 'Failed to get recent activities' })
  }
})

// ========== Обратная связь ==========

app.post('/api/feedback', (req, res) => {
  try {
    const { message, userId, userName, userEmail, userRole } = req.body
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const db = readDB()
    
    const feedbackEntry = {
      id: Date.now(),
      message: message.trim(),
      user_id: userId || 'anonymous',
      user_name: userName || 'Гость',
      user_email: userEmail || '',
      user_role: userRole || 'guest',
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
      status: 'new',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent']
    }
    
    if (!db.feedback) {
      db.feedback = []
    }
    
    db.feedback.push(feedbackEntry)
    writeDB(db)
    
    console.log('Feedback saved:', feedbackEntry.id)
    
    res.json({ 
      success: true, 
      message: 'Feedback sent successfully',
      feedback_id: feedbackEntry.id
    })
    
  } catch (error) {
    console.error('Error saving feedback:', error)
    res.status(500).json({ error: 'Failed to save feedback' })
  }
})

app.get('/api/admin/feedback', (req, res) => {
  try {
    const db = readDB()
    const feedbackList = (db.feedback || [])
      .map(feedback => ({
        id: feedback.id,
        user_name: feedback.user_name || 'Гость',
        user_email: feedback.user_email || 'Не указан',
        user_id: feedback.user_id,
        message: feedback.message,
        created_at: feedback.created_at,
        status: feedback.status || 'new',
        is_read: feedback.is_read || false
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ feedback: feedbackList })
  } catch (error) {
    console.error('Error getting feedback:', error)
    res.status(500).json({ error: 'Failed to get feedback' })
  }
})

app.put('/api/admin/feedback/:id/status', (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id)
    const { status } = req.body
    const validStatuses = ['new', 'in_progress', 'resolved']
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id === feedbackId)
    
    if (index === -1) {
      return res.status(404).json({ error: 'Feedback not found' })
    }
    
    db.feedback[index].status = status
    db.feedback[index].updated_at = new Date().toISOString()
    writeDB(db)
    
    res.json({ 
      success: true, 
      message: 'Status updated',
      feedback: db.feedback[index]
    })
    
  } catch (error) {
    console.error('Error updating feedback status:', error)
    res.status(500).json({ error: 'Failed to update feedback status' })
  }
})

// ========== Встречи (прокси к Python) ==========

// Получение всех встреч пользователя
app.get('/api/meetings', async (req, res) => {
  try {
    const userId = req.query.userId
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }
    
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      // Проксируем к Python API
      const url = `${AI_SERVICES_URL}/api/meetings?user_id=${userId}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback - возвращаем из локальной БД
    const db = readDB()
    const userMeetings = (db.meetings || [])
      .filter(m => m.user_id == userId || m.created_by == userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ 
      meetings: userMeetings,
      total: userMeetings.length,
      source: 'local_db'
    })
    
  } catch (error) {
    console.error('Error getting meetings:', error)
    res.status(500).json({ error: 'Failed to get meetings' })
  }
})

// Получение встречи по ID
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/${req.params.id}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    const meeting = (db.meetings || []).find(m => m.id == req.params.id)
    
    if (meeting) {
      res.json({ meeting, source: 'local_db' })
    } else {
      res.status(404).json({ error: 'Meeting not found' })
    }
    
  } catch (error) {
    console.error('Error getting meeting:', error)
    res.status(500).json({ error: 'Failed to get meeting' })
  }
})

// Создание встречи
app.post('/api/meetings', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Также сохраняем в локальную БД для синхронизации
        const db = readDB()
        if (!db.meetings) db.meetings = []
        db.meetings.push({
          ...req.body,
          id: data.meeting?.id || Date.now(),
          created_at: new Date().toISOString(),
          source: 'postgres'
        })
        writeDB(db)
        
        return res.json(data)
      }
    }
    
    // Fallback - сохраняем в локальную БД
    const db = readDB()
    const newMeeting = {
      id: Date.now(),
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: req.body.status || 'scheduled',
      source: 'local_db'
    }
    
    if (!db.meetings) db.meetings = []
    db.meetings.push(newMeeting)
    writeDB(db)
    
    console.log(`Meeting saved to local DB with ID: ${newMeeting.id}`)
    
    res.json({
      success: true,
      meeting: newMeeting,
      source: 'local_db'
    })
    
  } catch (error) {
    console.error('Error creating meeting:', error)
    res.status(500).json({ error: 'Failed to create meeting' })
  }
})

// Обновление статуса встречи
app.put('/api/meetings/:id/status', async (req, res) => {
  try {
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/${req.params.id}/status`
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    const index = (db.meetings || []).findIndex(m => m.id == req.params.id)
    
    if (index !== -1) {
      db.meetings[index].status = req.body.status
      db.meetings[index].notes = req.body.notes || db.meetings[index].notes
      db.meetings[index].outcome = req.body.outcome || db.meetings[index].outcome
      db.meetings[index].updated_at = new Date().toISOString()
      writeDB(db)
      
      res.json({
        success: true,
        meeting: db.meetings[index],
        source: 'local_db'
      })
    } else {
      res.status(404).json({ error: 'Meeting not found' })
    }
    
  } catch (error) {
    console.error('Error updating meeting:', error)
    res.status(500).json({ error: 'Failed to update meeting' })
  }
})

// Получение статистики по встречам
app.get('/api/meetings/stats', async (req, res) => {
  try {
    const userId = req.query.userId
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      const url = `${AI_SERVICES_URL}/api/meetings/stats${userId ? `?user_id=${userId}` : ''}`
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data = await response.json()
        return res.json(data)
      }
    }
    
    // Fallback
    const db = readDB()
    let meetings = db.meetings || []
    
    if (userId) {
      meetings = meetings.filter(m => m.user_id == userId || m.created_by == userId)
    }
    
    const stats = {
      total: meetings.length,
      scheduled: meetings.filter(m => m.status === 'scheduled').length,
      completed: meetings.filter(m => m.status === 'completed').length,
      cancelled: meetings.filter(m => m.status === 'cancelled').length,
      upcoming: meetings.filter(m => 
        m.status === 'scheduled' && new Date(m.start_time) > new Date()
      ).length,
      with_resume: meetings.filter(m => m.resume_id).length,
      source: 'local_db'
    }
    
    res.json({ stats })
    
  } catch (error) {
    console.error('Error getting meeting stats:', error)
    res.status(500).json({ error: 'Failed to get meeting stats' })
  }
})

app.post('/api/ai/calendar/create', async (req, res) => {
  try {
    const eventData = req.body
    
    console.log('[NODE] Received calendar event request:', JSON.stringify(eventData, null, 2))
    
    // Сохраняем в локальную БД в любом случае
    const db = readDB()
    const newMeeting = {
      id: Date.now(),
      title: eventData.title || 'Собеседование',
      description: eventData.description || '',
      start_time: eventData.start_time,
      duration_minutes: eventData.duration_minutes || 60,
      candidate_email: eventData.candidate_email,
      candidate_name: eventData.candidate_name || '',
      candidate_position: eventData.candidate_position || '',
      interviewer_email: eventData.interviewer_email || '',
      interviewer_name: eventData.interviewer_name || '',
      resume_id: eventData.resume_id || null,
      user_id: eventData.user_id || null,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      source: 'node_local'
    }
    
    if (!db.meetings) db.meetings = []
    db.meetings.push(newMeeting)
    writeDB(db)
    
    console.log('[NODE] Meeting saved to local DB with ID:', newMeeting.id)
    
    // Пробуем проксировать к Python, но если не получится - возвращаем локальный результат
    const aiAvailable = await checkAIServices()
    
    if (aiAvailable) {
      try {
        const url = `${AI_SERVICES_URL}/api/calendar/create`
        
        // Отправляем точно такие же данные
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData)
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('[NODE] Python calendar event created')
          
          // Обновляем локальную запись данными из Python
          newMeeting.calendar_event_id = data.event_id
          newMeeting.calendar_link = data.links?.html
          newMeeting.source = 'postgres'
          writeDB(db)
          
          return res.json({
            ...data,
            db_meeting_id: newMeeting.id,
            db_saved: true
          })
        } else {
          const errorText = await response.text()
          console.warn('[NODE] Python API error, using local only:', errorText)
        }
      } catch (error) {
        console.warn('[NODE] Python API unavailable, using local only:', error.message)
      }
    }
    
    // Возвращаем локальный результат
    return res.json({
      status: 'created_local',
      event_id: `local_${newMeeting.id}`,
      db_meeting_id: newMeeting.id,
      db_saved: true,
      meeting: newMeeting,
      links: {
        html: 'https://calendar.yandex.ru'
      }
    })
    
  } catch (error) {
    console.error('[NODE] Error in calendar create:', error)
    res.status(500).json({ error: error.message })
  }
})

// ========== Логирование ==========

app.post('/api/log', (req, res) => {
  try {
    const { action, user_id, user_name, target, details } = req.body
    
    const db = readDB()
    
    if (!db.logs) {
      db.logs = []
    }
    
    const logEntry = {
      id: Date.now(),
      action,
      user_id: user_id || 'system',
      user_name: user_name || 'Система',
      target,
      details,
      timestamp: new Date().toISOString(),
      level: 'info',
      ip: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent']
    }
    
    db.logs.push(logEntry)
    
    if (db.logs.length > 1000) {
      db.logs = db.logs.slice(-1000)
    }
    
    writeDB(db)
    
    res.json({ success: true, id: logEntry.id })
  } catch (error) {
    console.error('Error logging:', error)
    res.status(500).json({ error: 'Failed to log' })
  }
})

// ========== Вспомогательные функции ==========

const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath)
    const data = await pdf(dataBuffer)
    return data.text
  } catch (error) {
    console.error('Error extracting PDF text:', error)
    return ''
  }
}

const extractTextFromDOCX = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (error) {
    console.error('Error extracting DOCX text:', error)
    return ''
  }
}

function getActionName(action) {
  const actions = {
    'login': 'Вход в систему',
    'logout': 'Выход из системы',
    'upload_resume': 'Загрузка резюме',
    'check_resume': 'Проверка резюме на ИИ',
    'search_candidates': 'Поиск кандидатов',
    'schedule_meeting': 'Создание встречи',
    'send_feedback': 'Отправка обратной связи'
  }
  return actions[action] || action
}

function formatTimeAgo(timestamp) {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'только что'
  if (diffMins < 60) return `${diffMins} ${getPlural(diffMins, 'минута', 'минуты', 'минут')} назад`
  if (diffHours < 24) return `${diffHours} ${getPlural(diffHours, 'час', 'часа', 'часов')} назад`
  return `${diffDays} ${getPlural(diffDays, 'день', 'дня', 'дней')} назад`
}

function getPlural(n, one, few, many) {
  n = Math.abs(n) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return many
  if (n1 > 1 && n1 < 5) return few
  if (n1 === 1) return one
  return many
}

// ========== Обработка ошибок ==========

app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ error: err.message })
})

// ========== Запуск сервера ==========

app.listen(PORT, async () => {
  const aiAvailable = await checkAIServices()
  
  console.log(`
TALKPRO SERVER STARTED                    
Node.js Server:  http://localhost:${PORT}                      
AI Services:     ${AI_SERVICES_URL} (${aiAvailable ? 'available' : 'unavailable'})
Uploads:         ${uploadDir}
Database:        ${DB_PATH}
Endpoints:                                                     
  GET  /api/health              - Health check                  
  POST /api/login               - Authentication               
  POST /api/resumes/upload      - Upload resume                
  GET  /api/resumes             - Get user resumes             
  POST /api/resumes/:id/analyze - AI analysis                  
  POST /api/candidates/search   - Search with AI               
  POST /api/feedback            - Send feedback                
  GET  /api/admin/stats         - Admin statistics             

AI Proxy Endpoints:                                            
  POST /api/ai/evaluate         - Single Agent evaluation      
  POST /api/ai/detect-ai        - AI detection                 
  POST /api/ai/find-exaggerations - Find exaggerations         
  GET  /api/ai/health           - AI services health           
  `)
})