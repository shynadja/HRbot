// Моковые пользователи для демонстрации
export const MOCK_USERS = [
  {
    id: 1,
    email: 'user@example.com',
    password: 'user123',
    name: 'Иван Петров',
    role: 'user',
    avatar: null,
    created_at: '2026-01-15T10:00:00Z',
    last_active: new Date().toISOString(),
    searches_count: 45
  },
  {
    id: 2,
    email: 'admin@example.com',
    password: 'admin123',
    name: 'Админ Админов',
    role: 'admin',
    avatar: null,
    created_at: '2026-01-01T09:00:00Z',
    last_active: new Date().toISOString(),
    searches_count: 89
  }
]

// Вспомогательная функция для поиска пользователя
export const findUserByCredentials = (email, password) => {
  return MOCK_USERS.find(u => u.email === email && u.password === password)
}