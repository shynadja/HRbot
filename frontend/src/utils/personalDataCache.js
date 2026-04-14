const CACHE_KEY = 'talkpro_personal_data_cache'
const CACHE_VERSION = '1.0'

// Загрузка кэша из localStorage
const loadCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const data = JSON.parse(cached)
      if (data.version === CACHE_VERSION) {
        return data.cache || {}
      }
    }
  } catch (e) {
    console.error('Error loading personal data cache:', e)
  }
  return {}
}

// Сохранение кэша в localStorage
const saveCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: CACHE_VERSION,
      cache,
      updated: new Date().toISOString()
    }))
  } catch (e) {
    console.error('Error saving personal data cache:', e)
  }
}

let cache = loadCache()

/**
 * Сохранение персональных данных кандидата в кэш
 * @param {string} candidateUuid - UUID кандидата
 * @param {Object} personalData - { first_name, last_name, full_name, email, phone }
 */
export const cachePersonalData = (candidateUuid, personalData) => {
  if (!candidateUuid || !personalData) return
  
  cache[candidateUuid] = {
    first_name: personalData.first_name || '',
    last_name: personalData.last_name || '',
    full_name: personalData.full_name || `${personalData.first_name || ''} ${personalData.last_name || ''}`.trim(),
    email: personalData.email || '',
    phone: personalData.phone || '',
    cached_at: new Date().toISOString()
  }
  
  saveCache(cache)
}

/**
 * Получение персональных данных из кэша
 * @param {string} candidateUuid - UUID кандидата
 * @returns {Object|null} - персональные данные или null
 */
export const getPersonalData = (candidateUuid) => {
  return cache[candidateUuid] || null
}

/**
 * Получение всего кэша для отправки на сервер
 * @returns {Object} - весь кэш
 */
export const getFullCache = () => {
  return { ...cache }
}

/**
 * Объединение данных из БД и кэша для отображения
 * @param {Object} dbData - данные из БД (обезличенные)
 * @param {string} candidateUuid - UUID кандидата
 * @returns {Object} - полные данные для отображения
 */
export const enrichWithPersonalData = (dbData, candidateUuid) => {
  const personal = getPersonalData(candidateUuid)
  
  return {
    ...dbData,
    candidate_uuid: candidateUuid,
    first_name: personal?.first_name || '',
    last_name: personal?.last_name || '',
    full_name: personal?.full_name || '',
    email: personal?.email || '',
    phone: personal?.phone || ''
  }
}

/**
 * Обогащение списка кандидатов персональными данными
 * @param {Array} candidates - массив кандидатов из БД
 * @returns {Array} - обогащенный массив
 */
export const enrichCandidatesList = (candidates) => {
  return candidates.map(c => enrichWithPersonalData(c, c.candidate_uuid))
}

/**
 * Удаление персональных данных из кэша
 * @param {string} candidateUuid - UUID кандидата
 */
export const removePersonalData = (candidateUuid) => {
  delete cache[candidateUuid]
  saveCache(cache)
}

/**
 * Очистка всего кэша
 */
export const clearPersonalDataCache = () => {
  cache = {}
  localStorage.removeItem(CACHE_KEY)
}

/**
 * Получение статистики кэша
 */
export const getCacheStats = () => {
  return {
    total_entries: Object.keys(cache).length,
    uuids: Object.keys(cache),
    version: CACHE_VERSION
  }
}

// Экспорт для использования в компонентах
export default {
  cachePersonalData,
  getPersonalData,
  getFullCache,
  enrichWithPersonalData,
  enrichCandidatesList,
  removePersonalData,
  clearPersonalDataCache,
  getCacheStats
}