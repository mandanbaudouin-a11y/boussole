import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Numéro de version injecté à la compilation (voir App.jsx, pied de la
// barre latérale) — permet à un enseignant de confirmer sa version
// installée sans devoir aller chercher le nom du fichier .dmg/.exe
// téléchargé.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
