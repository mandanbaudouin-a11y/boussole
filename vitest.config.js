import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // node par defaut (tests serveur) : jsdom redefinit FormData/Blob avec
    // ses propres implementations, ce qui casse l'encodage multipart du
    // fetch natif de Node utilise par les tests d'upload (restauration de
    // sauvegarde). Les fichiers de composants React passent en jsdom via
    // `// @vitest-environment jsdom` en tete de fichier.
    environment: 'node',
    setupFiles: ['./tests/setup.js', './tests/setup-dom.js'],
  },
})
