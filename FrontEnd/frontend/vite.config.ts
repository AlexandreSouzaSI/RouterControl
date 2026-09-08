import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // ou '0.0.0.0'
    port: 5173
  },
  preview: {
    host: true,
    port: 4173,
    // Sem isso, o "vite preview" recusa qualquer requisição cujo Host não
    // seja localhost/IP — em produção, atrás do Nginx, o Host chega como
    // o domínio público, então precisa liberar explicitamente.
    allowedHosts: ['controlerota.amsx.online', 'api-controlerota.amsx.online'],
  },
})
