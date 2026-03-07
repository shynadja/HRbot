import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'http://localhost:3000',  // ваш текущий URL
      '.loca.lt'  // разрешить все поддомены loca.lt
    ],
    port: 3000,              // Фиксированный порт
    open: true,               // Автоматически открывать браузер
    host: true,               // Слушать на всех сетевых интерфейсах
    proxy: {
      '/api': {
        target: 'http://localhost:3001/api',  // Бэкенд
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,          // Для отладки
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom']  // Разделение кода
        }
      }
    }
  },
  preview: {
    port: 3000
  }
})
