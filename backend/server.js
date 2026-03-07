const express = require('express')
const multer = require('multer')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const bcrypt = require('bcryptjs') // или 'bcrypt'

const app = express()
const PORT = 3001

// Константы для хэширования
const SALT_ROUNDS = 10

// Настройка CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
  limits: { fileSize: 10 * 1024 * 1024 },
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
    logs: []
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

/**
 * Хэширование пароля
 * @param {string} password - исходный пароль
 * @returns {Promise<string>} - хэшированный пароль
 */
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

/**
 * Проверка пароля
 * @param {string} password - исходный пароль для проверки
 * @param {string} hash - хэшированный пароль из БД
 * @returns {Promise<boolean>} - результат проверки
 */
const verifyPassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash)
  } catch (error) {
    console.error('Error verifying password:', error)
    return false
  }
}

/**
 * Функция для инициализации тестовых пользователей с хэшированными паролями
 */
const initializeUsers = async () => {
  const db = readDB()
  
  // Если пользователи уже есть, не инициализируем
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
      searches_count: null,
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
      searches_count: null,
      avatar: null
    },
  ]
  
  writeDB(db)
  console.log('Initialized users with hashed passwords')
}

// Вызываем инициализацию при запуске
initializeUsers().catch(console.error)

// ========== Функции для парсинга резюме ==========

// Извлечение имени и фамилии из текста
function extractName(text) {
  // Ищем имя в начале текста (обычно первая строка)
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  for (let line of lines) {
    // Проверяем, похоже ли на имя (2-3 слова с заглавными буквами)
    const words = line.trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const hasCapitalLetters = words.every(word => word[0] && word[0] === word[0].toUpperCase());
      const noSpecialChars = !/[^\wа-яА-ЯёЁ\s-]/.test(line);
      
      if (hasCapitalLetters && noSpecialChars && line.length < 50) {
        return line.trim();
      }
    }
  }
  
  return 'Неизвестно';
}

// Извлечение должности из текста
function extractPosition(text) {
  const positionKeywords = [
    'должность', 'position', 'желаемая должность', 'desired position',
    'frontend', 'backend', 'fullstack', 'разработчик', 'developer',
    'senior', 'middle', 'junior', 'lead', 'architect',
    'менеджер', 'manager', 'дизайнер', 'designer', 'аналитик', 'analyst',
    'тестировщик', 'tester', 'qa', 'devops', 'product manager', 'project manager'
  ];
  
  const lines = text.split('\n');
  
  // Ищем строки, содержащие ключевые слова о должности
  for (let line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('должность') || lowerLine.includes('position')) {
      const parts = line.split(/[:|]/);
      if (parts.length > 1) {
        return parts[1].trim();
      }
    }
  }
  
  // Ищем по ключевым словам
  for (let line of lines) {
    const lowerLine = line.toLowerCase();
    for (let keyword of positionKeywords) {
      if (lowerLine.includes(keyword) && line.length < 100) {
        return line.trim();
      }
    }
  }
  
  return 'Специалист';
}

// Извлечение опыта работы
function extractExperience(text) {
  const experiencePatterns = [
    /опыт работы\s*[:\s]*(\d+)\s*(?:год|года|лет)/i,
    /experience\s*[:\s]*(\d+)\s*(?:year|years)/i,
    /стаж\s*[:\s]*(\d+)\s*(?:год|года|лет)/i,
    /(\d+)\s*(?:год|года|лет)\s*(?:опыт|стаж)/i,
    /(\d+)\s*г\.?\s*(\d+)\s*м/i,
    /(\d+)\s*y\.?\s*(\d+)\s*m/i
  ];
  
  for (let pattern of experiencePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && match[2]) {
        return `${match[1]} г ${match[2]} мес`;
      } else if (match[1]) {
        return `${match[1]} лет`;
      }
    }
  }
  
  // Пытаемся найти даты работы
  const datePattern = /(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\s*[—–-]\s*(?:по|to|present|настоящее|текущее|ныне)/i;
  const dates = text.match(datePattern);
  
  if (dates) {
    return 'от 1 года';
  }
  
  return 'Опыт не указан';
}

// Извлечение навыков
function extractSkills(text) {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python',
    'Java', 'C#', 'C++', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'HTML', 'CSS', 'SASS', 'LESS', 'Webpack', 'Babel', 'Git', 'Docker',
    'Kubernetes', 'AWS', 'Azure', 'GCP', 'MongoDB', 'PostgreSQL', 'MySQL',
    'Redis', 'Elasticsearch', 'Kafka', 'RabbitMQ', 'GraphQL', 'REST API',
    'Figma', 'Adobe XD', 'Sketch', 'Photoshop', 'Illustrator', 'UI/UX',
    'Project managment', 'agile', 'scrum', 'kanban', 'jira', 'confluence',
    'team leading', 'mentoring', 'communication', 'problem solving'
  ];
  
  const foundSkills = [];
  const lowerText = text.toLowerCase();
  
  // Ищем секцию с навыками
  const skillSections = text.split(/\n{2,}/);
  let skillsText = '';
  
  for (let section of skillSections) {
    const lowerSection = section.toLowerCase();
    if (lowerSection.includes('навык') || lowerSection.includes('skill') || 
        lowerSection.includes('технологи') || lowerSection.includes('technology')) {
      skillsText = section;
      break;
    }
  }
  
  // Если нашли секцию с навыками, ищем в ней
  const searchText = skillsText || text;
  
  for (let skill of commonSkills) {
    if (searchText.toLowerCase().includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
    if (foundSkills.length >= 5) break;
  }
  
  // Если навыков мало, ищем дополнительные
  if (foundSkills.length < 3) {
    const skillPattern = /[•\-*]\s*([A-Za-zА-Яа-я+#.]+(?:\s+[A-Za-zА-Яа-я+#.]+){0,2})/g;
    const matches = searchText.matchAll(skillPattern);
    for (let match of matches) {
      if (match[1] && match[1].length < 30 && !foundSkills.includes(match[1])) {
        foundSkills.push(match[1]);
      }
      if (foundSkills.length >= 5) break;
    }
  }
  
  return foundSkills.length > 0 ? foundSkills : ['React', 'JavaScript', 'HTML/CSS'];
}

// ========== API Endpoints ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    port: PORT
  })
})

// Загрузка резюме
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
      type: file.mimetype,
      path: file.path
    })

    // Извлекаем текст из файла
    let text = ''
    try {
      if (file.mimetype === 'application/pdf') {
        text = await extractTextFromPDF(file.path)
      } else if (file.mimetype === 'application/msword' || 
                 file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        text = await extractTextFromDOCX(file.path)
      }
    } catch (extractError) {
      console.error('Error extracting text:', extractError)
      text = 'Не удалось извлечь текст'
    }

    // Парсим данные из резюме
    const fullName = extractName(text);
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Иван';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Иванов';
    
    const position = extractPosition(text);
    const experience = extractExperience(text);
    const skills = extractSkills(text);

    // Простой анализ резюме
    const analysis = {
      score: Math.floor(Math.random() * 30) + 70,
      aiProbability: Math.floor(Math.random() * 50),
      suspiciousPhrases: [
        'оптимизация производительности с помощью инновационных подходов',
        'реализация сложных алгоритмов машинного обучения',
        'управление распределенной командой из 50+ человек'
      ].slice(0, Math.floor(Math.random() * 2) + 1)
    }

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
      text: text.substring(0, 4000),
      
      // Парсенные данные
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      position: position,
      experience: experience,
      skills: skills,
      
      analysis,
      is_active: true,
      deleted_at: null
    }
    
    db.resumes.push(newResume)
    writeDB(db)

    console.log('Resume saved with ID:', newResume.id)
    console.log('Parsed data:', {
      name: fullName,
      position,
      experience,
      skills
    })

    res.json({
      id: newResume.id,
      file_name: fileName,
      file_size: file.size,
      file_type: file.mimetype,
      upload_date: newResume.upload_date,
      analysis,
      candidate: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        position,
        experience,
        skills
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed: ' + error.message })
  }
})

// Получение всех активных резюме для пользователя
app.get('/api/resumes', (req, res) => {
  try {
    const db = readDB()
    const userId = req.query.userId || 'anonymous'
    
    // Фильтруем только активные резюме для конкретного пользователя
    const resumesList = db.resumes
      .filter(r => r.user_id === userId && r.is_active === true)
      .map(r => ({
        id: r.id,
        name: r.name,
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type,
        upload_date: r.upload_date,
        
        // Добавляем все парсенные данные
        full_name: r.full_name,
        first_name: r.first_name,
        last_name: r.last_name,
        position: r.position,
        experience: r.experience,
        skills: r.skills || [],
        candidate_name: r.full_name,
        
        user_id: r.user_id,
        is_active: r.is_active,
        analysis: r.analysis
      }))
    
    res.json({ resumes: resumesList })
  } catch (error) {
    console.error('Error getting resumes:', error)
    res.status(500).json({ error: 'Failed to get resumes' })
  }
})

// Получение всех резюме (включая удаленные) - для админа
app.get('/api/resumes/all', (req, res) => {
  try {
    const db = readDB()
    const resumesList = db.resumes.map(r => ({
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
      
      user_id: r.user_id,
      is_active: r.is_active,
      deleted_at: r.deleted_at
    }))
    
    res.json({ resumes: resumesList })
  } catch (error) {
    console.error('Error getting all resumes:', error)
    res.status(500).json({ error: 'Failed to get resumes' })
  }
})

// Получение конкретного резюме
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

// Просмотр файла резюме
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
    
    switch (ext) {
      case '.pdf':
        mimeType = 'application/pdf'
        break
      case '.doc':
        mimeType = 'application/msword'
        break
      case '.docx':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        break
    }

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resume.file_name)}"`)
    res.setHeader('Content-Length', resume.file_size)
    
    res.sendFile(path.resolve(filePath))
  } catch (error) {
    console.error('Error viewing resume:', error)
    res.status(500).json({ error: 'Failed to view resume' })
  }
})

// Мягкое удаление резюме
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
        message: 'Resume marked as deleted',
        resume: {
          id: db.resumes[index].id,
          is_active: false,
          deleted_at: db.resumes[index].deleted_at
        }
      })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error deleting resume:', error)
    res.status(500).json({ error: 'Failed to delete resume' })
  }
})

// Полное удаление резюме (для админа)
app.delete('/api/resumes/:id/permanent', (req, res) => {
  try {
    const db = readDB()
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    
    if (index !== -1) {
      const filePath = db.resumes[index].file_path
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log('File permanently deleted:', filePath)
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

// Восстановление удаленного резюме (для админа)
app.post('/api/resumes/:id/restore', (req, res) => {
  try {
    const db = readDB()
    const index = db.resumes.findIndex(r => r.id == req.params.id)
    
    if (index !== -1) {
      db.resumes[index].is_active = true
      db.resumes[index].deleted_at = null
      
      writeDB(db)
      
      res.json({ 
        success: true, 
        message: 'Resume restored',
        resume: {
          id: db.resumes[index].id,
          is_active: true,
          deleted_at: null
        }
      })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error restoring resume:', error)
    res.status(500).json({ error: 'Failed to restore resume' })
  }
})

// Анализ резюме
app.post('/api/resumes/:id/analyze', (req, res) => {
  try {
    const db = readDB()
    const resume = db.resumes.find(r => r.id == req.params.id)
    
    if (resume) {
      res.json(resume.analysis || {
        aiProbability: Math.floor(Math.random() * 100),
        suspiciousPhrases: [
          'оптимизация производительности с помощью инновационных подходов',
          'реализация сложных алгоритмов машинного обучения'
        ].slice(0, Math.floor(Math.random() * 2) + 1)
      })
    } else {
      res.status(404).json({ error: 'Resume not found' })
    }
  } catch (error) {
    console.error('Error analyzing resume:', error)
    res.status(500).json({ error: 'Failed to analyze resume' })
  }
})

// Поиск кандидатов (только по активным резюме)
app.post('/api/candidates/search', (req, res) => {
  try {
    const { query, resume_ids } = req.body
    const db = readDB()
    
    // Ищем только по активным резюме
    const candidates = db.resumes
      .filter(r => resume_ids.includes(r.id) && r.is_active === true)
      .map((r, index) => ({
        id: index + 1,
        resume_id: r.id,
        
        // Используем парсенные данные
        firstName: r.first_name || 'Иван',
        lastName: r.last_name || 'Иванов',
        fullName: r.full_name || `${r.first_name || 'Иван'} ${r.last_name || 'Иванов'}`,
        position: r.position || 'Разработчик',
        experience: r.experience || 'Опыт не указан',
        skills: r.skills && r.skills.length > 0 ? r.skills : ['React', 'JavaScript', 'HTML/CSS'],
        
        // Дополнительные поля
        company: 'Из резюме',
        location: 'Москва',
        phone: '+7 (999) 123-45-67',
        
        // Анализ
        score: r.analysis?.score || Math.floor(Math.random() * 30) + 70,
        aiProbability: r.analysis?.aiProbability || Math.floor(Math.random() * 50),
        suspiciousPhrases: r.analysis?.suspiciousPhrases || [],
        strengths: r.analysis?.strengths || ['Опыт работы', 'Навыки'],
        improvements: r.analysis?.improvements || ['Рекомендации']
      }))

    res.json({
      total_found: candidates.length,
      analyzed_deep: candidates.length,
      cached_count: 0,
      candidates
    })
  } catch (error) {
    console.error('Error searching candidates:', error)
    res.status(500).json({ error: 'Failed to search candidates' })
  }
})

// ========== Эндпоинты для аутентификации ==========

// Логин пользователя
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
    
    // Проверяем пароль
    const isValidPassword = await verifyPassword(password, user.password)
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' })
    }
    
    // Обновляем время последней активности
    user.last_active = new Date().toISOString()
    writeDB(db)
    
    // Логируем вход
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'login',
      user_id: user.id,
      user_name: user.name,
      details: `Вход в систему`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs
    writeDB(db)
    
    // Отправляем данные пользователя без пароля
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

// ========== Эндпоинты для админ-панели ==========

// Получение статистики для дашборда
app.get('/api/admin/stats', (req, res) => {
  try {
    const db = readDB()
    
    // Статистика по пользователям
    const users = db.users || []
    const activeToday = users.filter(u => {
      const lastActive = u.last_active ? new Date(u.last_active) : null
      const today = new Date()
      return lastActive && lastActive.toDateString() === today.toDateString()
    }).length

    // Статистика по резюме
    const resumes = db.resumes || []
    const totalResumes = resumes.filter(r => r.is_active === true).length
    const aiDetections = resumes.filter(r => r.analysis?.aiProbability > 50).length

    // Статистика по поискам (логируем в отдельной коллекции)
    const logs = db.logs || []
    const totalSearches = logs.filter(l => l.action === 'search_candidates').length
    const totalMeetings = logs.filter(l => l.action === 'schedule_meeting').length

    // Конверсия (пример)
    const conversionRate = totalSearches > 0 
      ? Math.round((totalMeetings / totalSearches) * 100) 
      : 0

    res.json({
      stats: {
        totalUsers: users.length,
        activeUsers: activeToday,
        totalSearches: totalSearches,
        totalMeetings: totalMeetings,
        totalResumes: totalResumes,
        aiDetections: aiDetections,
        conversionRate: conversionRate
      }
    })
  } catch (error) {
    console.error('Error getting admin stats:', error)
    res.status(500).json({ error: 'Failed to get admin stats' })
  }
})

// Получение списка пользователей
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

// Создание нового пользователя
app.post('/api/admin/users', async (req, res) => {
  try {
    const { name, email, password, role, status, admin_id, admin_name } = req.body
    
    // Валидация
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' })
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' })
    }
    
    // Проверка формата email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }
    
    const db = readDB()
    
    // Проверка на существующего пользователя
    const existingUser = db.users.find(u => u.email === email.toLowerCase().trim())
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' })
    }
    
    // Хэшируем пароль
    const hashedPassword = await hashPassword(password)
    
    // Создание нового пользователя
    const newUser = {
      id: Date.now(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'user',
      status: status || 'active',
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
      searches_count: 0,
      avatar: null
    }
    
    db.users.push(newUser)
    writeDB(db)
    
    // Логируем создание пользователя
    const logs = db.logs || []
    logs.push({
      id: Date.now() + 1,
      action: 'create_user',
      user_id: admin_id || 'system',
      user_name: admin_name || 'Система',
      target: newUser.email,
      details: `Создан пользователь ${newUser.name} с ролью ${newUser.role}`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs
    writeDB(db)
    
    // Возвращаем созданного пользователя без пароля
    const { password: _, ...userWithoutPassword } = newUser
    
    res.json({
      success: true,
      message: 'Пользователь успешно создан',
      user: userWithoutPassword
    })
    
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ error: 'Ошибка при создании пользователя' })
  }
})

// Обновление пользователя
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { name, email, role, status, password, admin_id, admin_name } = req.body
    
    const db = readDB()
    const userIndex = db.users.findIndex(u => u.id === userId)
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }
    
    // Проверка email на уникальность (если меняется)
    if (email && email !== db.users[userIndex].email) {
      const existingUser = db.users.find(u => u.email === email.toLowerCase().trim() && u.id !== userId)
      if (existingUser) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' })
      }
    }
    
    // Подготавливаем обновленные данные
    const updatedUser = {
      ...db.users[userIndex],
      name: name || db.users[userIndex].name,
      email: email ? email.toLowerCase().trim() : db.users[userIndex].email,
      role: role || db.users[userIndex].role,
      status: status || db.users[userIndex].status,
      updated_at: new Date().toISOString()
    }
    
    // Если передан новый пароль, хэшируем его
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' })
      }
      updatedUser.password = await hashPassword(password)
    }
    
    db.users[userIndex] = updatedUser
    writeDB(db)
    
    // Логируем обновление
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'update_user',
      user_id: admin_id || 'system',
      user_name: admin_name || 'Система',
      target: updatedUser.email,
      details: `Обновлен пользователь ${updatedUser.name}`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs
    writeDB(db)
    
    const { password: _, ...userWithoutPassword } = updatedUser
    
    res.json({
      success: true,
      message: 'Пользователь обновлен',
      user: userWithoutPassword
    })
    
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Ошибка при обновлении пользователя' })
  }
})

// Мягкое удаление пользователя (деактивация)
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { admin_id, admin_name } = req.body
    
    const db = readDB()
    const userIndex = db.users.findIndex(u => u.id === userId)
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }
    
    // Мягкое удаление - меняем статус на inactive
    db.users[userIndex].status = 'inactive'
    db.users[userIndex].deleted_at = new Date().toISOString()
    
    writeDB(db)
    
    // Логируем удаление
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'delete_user',
      user_id: admin_id || 'system',
      user_name: admin_name || 'Система',
      target: db.users[userIndex].email,
      details: `Деактивирован пользователь ${db.users[userIndex].name}`,
      timestamp: new Date().toISOString(),
      level: 'warning'
    })
    db.logs = logs
    writeDB(db)
    
    res.json({
      success: true,
      message: 'Пользователь деактивирован'
    })
    
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ error: 'Ошибка при удалении пользователя' })
  }
})

// Полное удаление пользователя (только для админа)
app.delete('/api/admin/users/:id/permanent', (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { admin_id, admin_name } = req.body
    
    const db = readDB()
    const userIndex = db.users.findIndex(u => u.id === userId)
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }
    
    const deletedUser = db.users[userIndex]
    db.users.splice(userIndex, 1)
    writeDB(db)
    
    // Логируем полное удаление
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'permanent_delete_user',
      user_id: admin_id || 'system',
      user_name: admin_name || 'Система',
      target: deletedUser.email,
      details: `Полностью удален пользователь ${deletedUser.name}`,
      timestamp: new Date().toISOString(),
      level: 'error'
    })
    db.logs = logs
    writeDB(db)
    
    res.json({
      success: true,
      message: 'Пользователь полностью удален'
    })
    
  } catch (error) {
    console.error('Error permanently deleting user:', error)
    res.status(500).json({ error: 'Ошибка при полном удалении пользователя' })
  }
})

// Получение последних действий
app.get('/api/admin/recent-activities', (req, res) => {
  try {
    const db = readDB()
    const logs = db.logs || []
    
    // Сортируем по дате (сначала новые)
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
          status: status
        }
      })
    
    res.json({ activities: recentActivities })
  } catch (error) {
    console.error('Error getting recent activities:', error)
    res.status(500).json({ error: 'Failed to get recent activities' })
  }
})

// Получение системных логов
app.get('/api/admin/logs', (req, res) => {
  try {
    const db = readDB()
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const startIndex = (page - 1) * limit
    
    const logs = db.logs || []
    
    // Сортируем по дате (сначала новые)
    const sortedLogs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    const paginatedLogs = sortedLogs.slice(startIndex, startIndex + limit)
    
    res.json({
      logs: paginatedLogs,
      pagination: {
        total: logs.length,
        page: page,
        limit: limit,
        pages: Math.ceil(logs.length / limit)
      }
    })
  } catch (error) {
    console.error('Error getting logs:', error)
    res.status(500).json({ error: 'Failed to get logs' })
  }
})

// Логирование действий пользователей
app.post('/api/log', (req, res) => {
  try {
    const { action, user_id, user_name, target, details } = req.body
    
    const db = readDB()
    
    if (!db.logs) {
      db.logs = []
    }
    
    const logEntry = {
      id: Date.now(),
      action: action,
      user_id: user_id || 'system',
      user_name: user_name || 'Система',
      target: target,
      details: details,
      timestamp: new Date().toISOString(),
      level: 'info',
      ip: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent']
    }
    
    db.logs.push(logEntry)
    
    // Ограничиваем количество логов (храним последние 1000)
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

// ========== Эндпоинты для обратной связи ==========

// Отправка обратной связи
app.post('/api/feedback', (req, res) => {
  try {
    const { message, userId, userName, userEmail, userRole } = req.body
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const db = readDB()
    
    // Создаем запись обратной связи
    const feedbackEntry = {
      id: Date.now(),
      message: message.trim(),
      user_id: userId || 'anonymous',
      user_name: userName || 'Гость',
      user_email: userEmail || '',
      user_role: userRole || 'guest',
      created_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
      status: 'new',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      session_id: req.headers['x-session-id'] || null
    }
    
    // Инициализируем массив feedback, если его нет
    if (!db.feedback) {
      db.feedback = []
    }
    
    db.feedback.push(feedbackEntry)
    writeDB(db)
    
    // Логируем получение反馈
    const logs = db.logs || []
    logs.push({
      id: Date.now() + 1,
      action: 'send_feedback',
      user_id: userId || 'anonymous',
      user_name: userName || 'Гость',
      target: 'feedback',
      details: `Отправлена обратная связь`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs
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

// Получение всех сообщений обратной связи (для админа)
app.get('/api/feedback/all', (req, res) => {
  try {
    const db = readDB()
    const feedbackList = db.feedback || []
    
    // Сортируем по дате создания (сначала новые)
    feedbackList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ feedback: feedbackList })
  } catch (error) {
    console.error('Error getting feedback:', error)
    res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Получение сообщений обратной связи пользователя
app.get('/api/feedback/user/:userId', (req, res) => {
  try {
    const db = readDB()
    const userId = req.params.userId
    const feedbackList = (db.feedback || [])
      .filter(f => f.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ feedback: feedbackList })
  } catch (error) {
    console.error('Error getting user feedback:', error)
    res.status(500).json({ error: 'Failed to get user feedback' })
  }
})

// Получение конкретного сообщения обратной связи
app.get('/api/feedback/:id', (req, res) => {
  try {
    const db = readDB()
    const feedback = (db.feedback || []).find(f => f.id == req.params.id)
    
    if (feedback) {
      res.json(feedback)
    } else {
      res.status(404).json({ error: 'Feedback not found' })
    }
  } catch (error) {
    console.error('Error getting feedback:', error)
    res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Отметить сообщение как прочитанное (для админа)
app.put('/api/feedback/:id/read', (req, res) => {
  try {
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id == req.params.id)
    
    if (index !== -1) {
      db.feedback[index].is_read = true
      db.feedback[index].read_at = new Date().toISOString()
      
      writeDB(db)
      
      res.json({ 
        success: true, 
        message: 'Feedback marked as read',
        feedback: db.feedback[index]
      })
    } else {
      res.status(404).json({ error: 'Feedback not found' })
    }
  } catch (error) {
    console.error('Error marking feedback as read:', error)
    res.status(500).json({ error: 'Failed to mark feedback as read' })
  }
})

// Обновить статус сообщения (для админа)
app.put('/api/feedback/:id/status', (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['new', 'in_progress', 'resolved']
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id == req.params.id)
    
    if (index !== -1) {
      db.feedback[index].status = status
      db.feedback[index].updated_at = new Date().toISOString()
      
      writeDB(db)
      
      res.json({ 
        success: true, 
        message: 'Feedback status updated',
        feedback: db.feedback[index]
      })
    } else {
      res.status(404).json({ error: 'Feedback not found' })
    }
  } catch (error) {
    console.error('Error updating feedback status:', error)
    res.status(500).json({ error: 'Failed to update feedback status' })
  }
})

// Удалить сообщение обратной связи (для админа)
app.delete('/api/feedback/:id', (req, res) => {
  try {
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id == req.params.id)
    
    if (index !== -1) {
      db.feedback.splice(index, 1)
      writeDB(db)
      
      res.json({ success: true, message: 'Feedback deleted' })
    } else {
      res.status(404).json({ error: 'Feedback not found' })
    }
  } catch (error) {
    console.error('Error deleting feedback:', error)
    res.status(500).json({ error: 'Failed to delete feedback' })
  }
})

// Получить статистику по обратной связи (для админа)
app.get('/api/feedback/stats', (req, res) => {
  try {
    const db = readDB()
    const feedback = db.feedback || []
    
    const stats = {
      total: feedback.length,
      new: feedback.filter(f => f.status === 'new').length,
      in_progress: feedback.filter(f => f.status === 'in_progress').length,
      resolved: feedback.filter(f => f.status === 'resolved').length,
      unread: feedback.filter(f => !f.is_read).length,
      by_user: {},
      by_date: {}
    }
    
    // Статистика по пользователям
    feedback.forEach(f => {
      const userId = f.user_id
      if (!stats.by_user[userId]) {
        stats.by_user[userId] = {
          user_name: f.user_name,
          count: 0
        }
      }
      stats.by_user[userId].count++
    })
    
    res.json({ stats })
  } catch (error) {
    console.error('Error getting feedback stats:', error)
    res.status(500).json({ error: 'Failed to get feedback stats' })
  }
})

// ========== Эндпоинты для обращений пользователей ==========

// Получение всех обращений
app.get('/api/admin/feedback', (req, res) => {
  try {
    const db = readDB()
    const feedbackList = (db.feedback || []).map(feedback => ({
      id: feedback.id,
      user_name: feedback.user_name || 'Гость',
      user_email: feedback.user_email || 'Не указан',
      user_id: feedback.user_id,
      message: feedback.message,
      created_at: feedback.created_at,
      status: feedback.status || 'new',
      is_read: feedback.is_read || false
    }))
    
    // Сортируем по дате (сначала новые)
    feedbackList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    res.json({ feedback: feedbackList })
  } catch (error) {
    console.error('Error getting feedback:', error)
    res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Получение статистики по обращениям
app.get('/api/admin/feedback/stats', (req, res) => {
  try {
    const db = readDB()
    const feedback = db.feedback || []
    
    const stats = {
      total: feedback.length,
      new: feedback.filter(f => f.status === 'new').length,
      in_progress: feedback.filter(f => f.status === 'in_progress').length,
      resolved: feedback.filter(f => f.status === 'resolved').length,
      unread: feedback.filter(f => !f.is_read).length
    }
    
    res.json({ stats })
  } catch (error) {
    console.error('Error getting feedback stats:', error)
    res.status(500).json({ error: 'Failed to get feedback stats' })
  }
})

// Обновление статуса обращения
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
    
    // Логируем изменение статуса
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'update_feedback_status',
      user_id: req.body.admin_id || 'system',
      user_name: req.body.admin_name || 'Система',
      target: `Feedback #${feedbackId}`,
      details: `Статус изменен на ${status}`,
      timestamp: new Date().toISOString(),
      level: 'info'
    })
    db.logs = logs
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

// Отметить обращение как прочитанное
app.put('/api/admin/feedback/:id/read', (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id)
    
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id === feedbackId)
    
    if (index === -1) {
      return res.status(404).json({ error: 'Feedback not found' })
    }
    
    db.feedback[index].is_read = true
    db.feedback[index].read_at = new Date().toISOString()
    
    writeDB(db)
    
    res.json({ 
      success: true, 
      message: 'Feedback marked as read',
      feedback: db.feedback[index]
    })
    
  } catch (error) {
    console.error('Error marking feedback as read:', error)
    res.status(500).json({ error: 'Failed to mark feedback as read' })
  }
})

// Удаление обращения
app.delete('/api/admin/feedback/:id', (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id)
    const { admin_id, admin_name } = req.body
    
    const db = readDB()
    const index = (db.feedback || []).findIndex(f => f.id === feedbackId)
    
    if (index === -1) {
      return res.status(404).json({ error: 'Feedback not found' })
    }
    
    const deletedFeedback = db.feedback[index]
    db.feedback.splice(index, 1)
    writeDB(db)
    
    // Логируем удаление
    const logs = db.logs || []
    logs.push({
      id: Date.now(),
      action: 'delete_feedback',
      user_id: admin_id || 'system',
      user_name: admin_name || 'Система',
      target: `Feedback #${feedbackId}`,
      details: `Удалено обращение от ${deletedFeedback.user_name}`,
      timestamp: new Date().toISOString(),
      level: 'warning'
    })
    db.logs = logs
    writeDB(db)
    
    res.json({ success: true, message: 'Feedback deleted' })
    
  } catch (error) {
    console.error('Error deleting feedback:', error)
    res.status(500).json({ error: 'Failed to delete feedback' })
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
    'view_candidate': 'Просмотр кандидата',
    'export_data': 'Экспорт данных',
    'delete_resume': 'Удаление резюме',
    'update_settings': 'Изменение настроек',
    'create_user': 'Создание пользователя',
    'update_user': 'Обновление пользователя',
    'delete_user': 'Деактивация пользователя',
    'permanent_delete_user': 'Полное удаление пользователя',
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

// ========== Запуск сервера ==========

app.listen(PORT, () => {
  console.log(`
  Сервер успешно запущен!
  URL: http://localhost:${PORT}
  Папка загрузок: ${uploadDir}
  База данных: ${DB_PATH}
  
  Доступные endpoints:
  GET  /api/health
  POST /api/login
  POST /api/resumes/upload
  GET  /api/resumes?userId=...
  GET  /api/resumes/all
  GET  /api/resumes/:id
  GET  /api/resumes/:id/view
  DELETE /api/resumes/:id
  DELETE /api/resumes/:id/permanent
  POST /api/resumes/:id/restore
  POST /api/resumes/:id/analyze
  POST /api/candidates/search
  POST /api/log
  POST /api/feedback
  GET  /api/feedback/all
  GET  /api/feedback/user/:userId
  PUT  /api/feedback/:id/read
  PUT  /api/feedback/:id/status
  DELETE /api/feedback/:id
  GET  /api/feedback/stats
  GET  /api/admin/stats
  GET  /api/admin/users
  POST /api/admin/users
  PUT  /api/admin/users/:id
  DELETE /api/admin/users/:id
  DELETE /api/admin/users/:id/permanent
  GET  /api/admin/recent-activities
  GET  /api/admin/logs
  
  Проверьте: http://localhost:${PORT}/api/health
  `)
})

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err)
  res.status(500).json({ error: err.message })
})