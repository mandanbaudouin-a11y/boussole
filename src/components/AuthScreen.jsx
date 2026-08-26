import { useState } from 'react'
import { TEACHER_TITLES } from '../teacherTitles'

export default function AuthScreen({ mode, onSubmit, message }) {
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
        setError("Le nom d'utilisateur doit contenir au moins 3 caractères.")
        return
      }
      if (password.length < 8) {
        setError('Le mot de passe doit contenir au moins 8 caractères.')
        return
      }
      if (password !== confirmPassword) {
        setError('Les deux mots de passe ne correspondent pas.')
        return
      }
      if (!nomComplet.trim()) {
        setError('Le nom complet est requis.')
        return
      }
      if (!courriel.trim() || !courriel.includes('@')) {
        setError('Un courriel valide est requis.')
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
          <div className="brand-row">
            <img src="/logo-boussole-icon.svg" alt="" className="brand-icon" />
            <span className="brand" style={{ color: '#fff', fontSize: 24 }}>Boussole</span>
          </div>
          <div>
            <h2 className="auth-tagline">Les plans d'enseignement individualisé, au même endroit.</h2>
            <p className="auth-tagline-sub">
              Suivi des objectifs, adaptations et révisions — prêt à partager en rencontre avec les parents.
            </p>
          </div>
          <p className="auth-panel-brand-footer">École Rivière-Rouge</p>
        </div>

        <form className="auth-panel-form" onSubmit={submit}>
        <p className="auth-subtitle" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          {isSetup ? 'Créer un compte' : 'Connexion'}
        </p>
        <p className="auth-subtitle">
          {isSetup ? 'Compte enseignant — accès complet à l\'application' : 'Accédez à vos élèves et à leurs PEI'}
        </p>

        {message && <div className="alert alert-warning" style={{ marginBottom: 16 }}>{message}</div>}
        {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}

        {!isSetup && (
          <>
            <span className="auth-label">Se connecter en tant que</span>
            <div className="role-toggle">
              <button
                type="button"
                className={`role-toggle-btn ${role === 'enseignant' ? 'active' : ''}`}
                onClick={() => setRole('enseignant')}
              >
                Enseignant
              </button>
              <button
                type="button"
                className={`role-toggle-btn ${role === 'ea' ? 'active' : ''}`}
                onClick={() => setRole('ea')}
              >
                EA
              </button>
            </div>
          </>
        )}

        <label className="auth-label" htmlFor="username">Nom d'utilisateur</label>
        <input
          id="username"
          className="text-input"
          style={{ width: '100%', marginBottom: 14 }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="auth-label" htmlFor="password">Mot de passe</label>
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
            <label className="auth-label" htmlFor="confirm-password">Confirmer le mot de passe</label>
            <input
              id="confirm-password"
              type="password"
              className="text-input"
              style={{ width: '100%', marginBottom: 14 }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <label className="auth-label" htmlFor="nom-complet">Nom complet</label>
            <input
              id="nom-complet"
              className="text-input"
              style={{ width: '100%', marginBottom: 14 }}
              value={nomComplet}
              onChange={(e) => setNomComplet(e.target.value)}
              autoComplete="name"
            />

            <label className="auth-label" htmlFor="courriel">Courriel</label>
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
              {showSchoolInfo ? 'Masquer' : 'Ajouter'} les infos de l'école — optionnel
            </button>

            {showSchoolInfo && (
              <div style={{ marginBottom: 14 }}>
                <label className="auth-label" htmlFor="ecole">École</label>
                <input
                  id="ecole"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. École Rivière-Rouge"
                  value={ecole}
                  onChange={(e) => setEcole(e.target.value)}
                />

                <label className="auth-label" htmlFor="division">Division scolaire</label>
                <input
                  id="division"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. Seven Oaks School Division"
                  value={divisionScolaire}
                  onChange={(e) => setDivisionScolaire(e.target.value)}
                />

                <label className="auth-label" htmlFor="annee">Année scolaire</label>
                <input
                  id="annee"
                  className="text-input"
                  style={{ width: '100%', marginBottom: 12 }}
                  placeholder="ex. 2026-2027"
                  value={anneeScolaire}
                  onChange={(e) => setAnneeScolaire(e.target.value)}
                />

                <label className="auth-label" htmlFor="titre">Titre</label>
                <select
                  id="titre"
                  className="text-input"
                  style={{ width: '100%' }}
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                >
                  <option value="">—</option>
                  {TEACHER_TITLES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
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
                Je comprends que les données des élèves sont stockées localement sur cet ordinateur et que
                je suis responsable de leur protection conformément à la LAIPVP/FIPPA (Manitoba).
              </span>
            </label>
          </>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Veuillez patienter...' : isSetup ? 'Créer le compte' : 'Se connecter'}
        </button>
        </form>
      </div>
    </div>
  )
}
