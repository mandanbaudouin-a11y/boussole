import { useState } from 'react'
import { TEACHER_TITLES } from '../teacherTitles'
import { useLanguage } from '../i18n/LanguageContext'
import LanguageToggle from './LanguageToggle'

export default function AuthScreen({ mode, onSubmit, message }) {
  const { t } = useLanguage()
  const isSetup = mode === 'setup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState('enseignant')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [nomComplet, setNomComplet] = useState('')
  const [courriel, setCourriel] = useState('')
  const [showSchoolInfo, setShowSchoolInfo] = useState(false)
  const [ecole, setEcole] = useState('')
  const [divisionScolaire, setDivisionScolaire] = useState('')
  const [anneeScolaire, setAnneeScolaire] = useState('')
  const [titre, setTitre] = useState('')
  const [laipvpAcknowledged, setLaipvpAcknowledged] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    if (isSetup) {
      if (username.trim().length < 3) {
        setError(t("Le nom d'utilisateur doit contenir au moins 3 caractères."))
        return
      }
      if (password.length < 8) {
        setError(t('Le mot de passe doit contenir au moins 8 caractères.'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('Les deux mots de passe ne correspondent pas.'))
        return
      }
      if (!nomComplet.trim()) {
        setError(t('Le nom complet est requis.'))
        return
      }
      if (!courriel.trim() || !courriel.includes('@')) {
        setError(t('Un courriel valide est requis.'))
        return
      }
    }

    setLoading(true)
    try {
      if (isSetup) {
        await onSubmit(username.trim(), password, undefined, {
          nomComplet: nomComplet.trim(),
          courriel: courriel.trim(),
          ecole: ecole.trim(),
          divisionScolaire: divisionScolaire.trim(),
          anneeScolaire: anneeScolaire.trim(),
          titre,
          laipvpAcknowledged,
        })
      } else {
        await onSubmit(username.trim(), password, role)
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-split">
        <div className="auth-panel-brand">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="brand-row" style={{ marginBottom: 0 }}>
              <img src="/logo-repere-icon.svg" alt="" className="brand-icon" />
              <span className="brand" style={{ color: '#fff', fontSize: 24 }}>Repère</span>
            </div>
            <LanguageToggle className="on-dark" />
          </div>
          <div>
            <h2 className="auth-tagline">{t("Les plans d'enseignement individualisé, au même endroit.")}</h2>
            <p className="auth-tagline-sub">
              {t('Suivi des objectifs, adaptations et révisions — prêt à partager en rencontre avec les parents.')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/logo-ecole-riviere-rouge.png"
              alt=""
              style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', padding: 3, objectFit: 'contain' }}
            />
            <p className="auth-panel-brand-footer" style={{ margin: 0 }}>{t('École Rivière-Rouge')}</p>
          </div>
        </div>

        <form className="auth-panel-form" onSubmit={submit}>
        <p className="auth-subtitle" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          {isSetup ? t('Créer un compte') : t('Connexion')}
        </p>
        <p className="auth-subtitle">
          {isSetup ? t("Compte enseignant — accès complet à l'application") : t('Accédez à vos élèves et à leurs PEI')}
        </p>

        {message && <div className="alert alert-warning" style={{ marginBottom: 16 }}>{message}</div>}
        {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}

        {!isSetup && (
          <>
            <span className="auth-label">{t('Se connecter en tant que')}</span>
            <div className="role-toggle">
              <button
                type="button"
                className={`role-toggle-btn ${role === 'enseignant' ? 'active' : ''}`}
                onClick={() => setRole('enseignant')}
              >
                {t('Enseignant')}
              </button>
              <button
                type="button"
                className={`role-toggle-btn ${role === 'ea' ? 'active' : ''}`}
                onClick={() => setRole('ea')}
              >
                {t('EA')}
              </button>
            </div>
          </>
        )}

        <label className="auth-label" htmlFor="username">{t("Nom d'utilisateur")}</label>
        <input
          id="username"
          className="text-input"
          style={{ width: '100%', marginBottom: 14 }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="auth-label" htmlFor="password">{t('Mot de passe')}</label>
        <input
          id="password"
          type="password"
          className="text-input"
          style={{ width: '100%', marginBottom: isSetup ? 14 : 22 }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSetup ? 'new-password' : 'current-password'}
        />

        {isSetup && (
          <>
            <label className="auth-label" htmlFor="confirm-password">{t('Confirmer le mot de passe')}</label>
            <input
              id="confirm-password"
              type="password"
              className="text-input"
              style={{ width: '100%', marginBottom: 14 }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <label className="auth-label" htmlFor="nom-complet">{t('Nom complet')}</label>
            <input
              id="nom-complet"
              className="text-input"
              style={{ width: '100%', marginBottom: 14 }}
              value={nomComplet}
              onChange={(e) => setNomComplet(e.target.value)}
              autoComplete="name"
            />

            <label className="auth-label" htmlFor="courriel">{t('Courriel')}</label>
            <input
              id="courriel"
              type="email"
              className="text-input"
              style={{ width: '100%', marginBottom: 14 }}
              value={courriel}
              onChange={(e) => setCourriel(e.target.value)}
              autoComplete="email"
            />

            <button
              type="button"
              className="back-link"
              style={{ marginBottom: showSchoolInfo ? 12 : 22 }}
              onClick={() => setShowSchoolInfo((v) => !v)}
            >
              {showSchoolInfo ? t('Masquer') : t('Ajouter')} {t("les infos de l'école — optionnel")}
            </button>

            {showSchoolInfo && (
              <div style={{ marginBottom: 14 }}>
                <label className="auth-label" htmlFor="ecole">{t('École')}</label>
                <input
                  id="ecole"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. École Rivière-Rouge"
                  value={ecole}
                  onChange={(e) => setEcole(e.target.value)}
                />

                <label className="auth-label" htmlFor="division">{t('Division scolaire')}</label>
                <input
                  id="division"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. Seven Oaks School Division"
                  value={divisionScolaire}
                  onChange={(e) => setDivisionScolaire(e.target.value)}
                />

                <label className="auth-label" htmlFor="annee">{t('Année scolaire')}</label>
                <input
                  id="annee"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. 2026-2027"
                  value={anneeScolaire}
                  onChange={(e) => setAnneeScolaire(e.target.value)}
                />

                <label className="auth-label" htmlFor="titre">{t('Titre')}</label>
                <select
                  id="titre"
                  className="text-input"
                  style={{ width: '100%' }}
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                >
                  <option value="">{t('—')}</option>
                  {TEACHER_TITLES.map((t2) => (
                    <option key={t2.value} value={t2.value}>{t(t2.label)}</option>
                  ))}
                </select>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 22, fontSize: 13 }}>
              <input
                type="checkbox"
                className="goal-check"
                style={{ marginTop: 2 }}
                checked={laipvpAcknowledged}
                onChange={(e) => setLaipvpAcknowledged(e.target.checked)}
              />
              <span>
                {t('Je comprends que les données des élèves sont stockées localement sur cet ordinateur et que je suis responsable de leur protection conformément à la LAIPVP/FIPPA (Manitoba).')}
              </span>
            </label>
          </>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? t('Veuillez patienter...') : isSetup ? t('Créer le compte') : t('Se connecter')}
        </button>
        </form>
      </div>
    </div>
  )
}
