import { useLanguage } from '../i18n/LanguageContext'

export default function LanguageToggle({ className = '', style }) {
  const { lang, setLang } = useLanguage()

  return (
    <div className={`lang-toggle ${className}`} style={style} role="group" aria-label="Langue / Language">
      <button
        type="button"
        className={lang === 'fr' ? 'active' : ''}
        onClick={() => setLang('fr')}
      >
        FR
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </div>
  )
}
