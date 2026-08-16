import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // В разработке фронт живёт отдельно, а API отдаёт сервер на 3000
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
