import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'

// Настройка PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

/**
 * Извлечение текста из PDF
 */
export const extractTextFromPDF = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    let fullText = ''
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    return fullText
  } catch (error) {
    console.error('Error extracting PDF text:', error)
    return ''
  }
}

/**
 * Извлечение текста из DOCX
 */
export const extractTextFromDOCX = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  } catch (error) {
    console.error('Error extracting DOCX text:', error)
    return ''
  }
}

/**
 * Извлечение текста из файла (автоопределение типа)
 */
export const extractTextFromFile = async (file) => {
  if (file.type === 'application/pdf') {
    return await extractTextFromPDF(file)
  } else if (file.type.includes('word') || file.type.includes('document')) {
    return await extractTextFromDOCX(file)
  }
  return ''
}

/**
 * Извлечение имени из текста
 */
const extractName = (text) => {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  
  for (let line of lines.slice(0, 10)) {
    const words = line.trim().split(/\s+/)
    if (words.length >= 2 && words.length <= 4) {
      const hasCapitalLetters = words.every(word => 
        word[0] && word[0] === word[0].toUpperCase()
      )
      const noSpecialChars = !/[^\wа-яА-ЯёЁ\s-]/i.test(line)
      
      if (hasCapitalLetters && noSpecialChars && line.length < 50) {
        return line.trim()
      }
    }
  }
  
  return ''
}

/**
 * Извлечение должности
 */
const extractPosition = (text) => {
  const positionKeywords = [
    'должность', 'position', 'желаемая должность',
    'frontend', 'backend', 'fullstack', 'разработчик', 'developer',
    'senior', 'middle', 'junior', 'lead', 'architect',
    'менеджер', 'manager', 'дизайнер', 'designer', 'аналитик',
    'тестировщик', 'tester', 'qa', 'devops', 'ml', 'data scientist'
  ]
  
  const lines = text.split('\n')
  const lowerText = text.toLowerCase()
  
  for (let keyword of positionKeywords) {
    if (lowerText.includes(keyword)) {
      for (let line of lines) {
        if (line.toLowerCase().includes(keyword) && line.length < 100) {
          return line.trim()
        }
      }
    }
  }
  
  return 'Специалист'
}

/**
 * Извлечение опыта
 */
const extractExperience = (text) => {
  const patterns = [
    /опыт работы\s*[:\s]*(\d+)\s*(?:год|года|лет)/i,
    /experience\s*[:\s]*(\d+)\s*(?:year|years)/i,
    /(\d+)\s*(?:год|года|лет)\s*(?:опыт|стаж)/i
  ]
  
  for (let pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return `${match[1]} лет`
    }
  }
  
  return 'Опыт не указан'
}

/**
 * Извлечение навыков
 */
const extractSkills = (text) => {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python',
    'Java', 'C#', 'C++', 'PHP', 'Go', 'Rust', 'Swift', 'Kotlin',
    'HTML', 'CSS', 'SASS', 'Webpack', 'Git', 'Docker',
    'Kubernetes', 'AWS', 'Azure', 'GCP', 'MongoDB', 'PostgreSQL', 'MySQL',
    'Redis', 'GraphQL', 'REST API', 'SQL', 'FastAPI', 'Django',
    'Flask', 'Spring', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy'
  ]
  
  const found = []
  const lowerText = text.toLowerCase()
  
  for (let skill of commonSkills) {
    if (lowerText.includes(skill.toLowerCase())) {
      found.push(skill)
    }
    if (found.length >= 8) break
  }
  
  return found.length > 0 ? found : ['React', 'JavaScript', 'HTML/CSS']
}

/**
 * Извлечение email
 */
const extractEmail = (text) => {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  const match = text.match(emailPattern)
  return match ? match[0] : ''
}

/**
 * Извлечение телефона
 */
const extractPhone = (text) => {
  const phonePattern = /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/
  const match = text.match(phonePattern)
  return match ? match[0].replace(/\s+/g, ' ') : ''
}

/**
 * Извлечение локации
 */
const extractLocation = (text) => {
  const cities = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Сочи']
  for (let city of cities) {
    if (text.includes(city)) {
      return city
    }
  }
  return 'Москва'
}

/**
 * Извлечение образования
 */
const extractEducation = (text) => {
  const eduKeywords = ['образование', 'education', 'университет', 'university', 'институт', 'institute']
  const lines = text.split('\n')
  const lowerText = text.toLowerCase()
  
  for (let keyword of eduKeywords) {
    if (lowerText.includes(keyword)) {
      for (let line of lines) {
        if (line.toLowerCase().includes(keyword) && line.length > 10 && line.length < 200) {
          return line.trim()
        }
      }
    }
  }
  
  return ''
}

/**
 * Полный парсинг резюме
 */
export const parseResumeFile = async (file) => {
  const text = await extractTextFromFile(file)
  
  const fullName = extractName(text)
  const nameParts = fullName.split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''
  
  return {
    // Персональные данные (для кэша)
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: extractEmail(text),
    phone: extractPhone(text),
    
    // Обезличенные данные (для сервера)
    position: extractPosition(text),
    experience: extractExperience(text),
    skills: extractSkills(text),
    hard_skills: extractSkills(text).join(', '),
    soft_skills: '',
    education: extractEducation(text),
    location: extractLocation(text),
    
    // Полный текст
    raw_text: text.substring(0, 8000)
  }
}