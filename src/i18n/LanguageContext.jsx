import { createContext, useContext, useState } from 'react'
import { en } from './en'

const STORAGE_KEY = 'boussole-lang'

const LanguageContext = createContext({
  lang: 'fr',
  setLang: () => {},
  t: (key) => key,
})

function interpolate(str, vars) {
  if (!vars) return str
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), str)
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'fr'
    } catch {
      return 'fr'
    }
  })

  const setLang = (l) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // stockage indisponible (mode privé, etc.) — la langue reste active
      // pour la session en cours, simplement pas mémorisée
    }
  }

  const t = (key, vars) => interpolate(lang === 'en' ? en[key] ?? key : key, vars)

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
