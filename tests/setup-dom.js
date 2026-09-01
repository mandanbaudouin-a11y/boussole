// Matchers additionnels (toBeInTheDocument, etc.) pour les tests de
// composants React. Sans effet sur les tests serveur (aucun acces au DOM ici).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Demonte les composants rendus apres chaque test (sinon deux `render()`
// dans le meme fichier laissent les deux arbres dans le DOM en meme temps).
afterEach(() => {
  cleanup()
})

// jsdom 30 n'expose pas localStorage par defaut : petit polyfill en memoire,
// suffisant pour les tests de composants qui en dependent (ex. LanguageToggle).
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map()
  const localStorageStub = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageStub, writable: true })
}
