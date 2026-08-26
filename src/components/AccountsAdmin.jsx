import { useEffect, useState } from 'react'
import { auth } from '../auth'
import { api } from '../api'
import { TEACHER_TITLES, TEACHER_TITLE_LABELS } from '../teacherTitles'

const ROLE_LABELS = { enseignant: 'Enseignant', ea: 'EA' }

function NewEaForm({ onCreated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (username.trim().length < 3) {
      setError("Le nom d'utilisateur doit contenir au moins 3 caractères.")
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    setSaving(true)
    try {
      await auth.createEaAccount(username.trim(), password)
      setUsername('')
      setPassword('')
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card new-student-form" onSubmit={submit}>
      <div className="card-header">
        <p className="student-name" style={{ cursor: 'default' }}>Créer un compte EA</p>
      </div>
      {error && <div className="alert alert-urgent" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-row">
        <input
          className="text-input"
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="text-input"
          type="password"
          placeholder="Mot de passe (8 caractères min.)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Création...' : 'Créer le compte'}
        </button>
      </div>
    </form>
  )
}

const KEY_PLACEHOLDERS = {
  anthropic: 'sk-ant-...',
  mistral: 'Clé API Mistral...',
}

function ProviderKeyRow({ provider, label, configured, isActive, activating, onSaved, onRemoved, onActivate }) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.saveAiApiKey(provider, apiKey.trim())
      setApiKey('')
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Retirer la clé API ${label} ? La génération par ce fournisseur sera désactivée.`)) return
    setSaving(true)
    setError(null)
    try {
      await api.clearAiApiKey(provider)
      onRemoved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <p style={{ margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          {label}
          {isActive && <span className="status-badge status-atteint">Actif</span>}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="page-date" style={{ margin: 0 }}>{configured ? 'clé configurée' : 'aucune clé'}</span>
          {!isActive && configured && (
            <button className="btn" onClick={() => onActivate(provider)} disabled={activating}>
              {activating ? 'Activation...' : 'Rendre actif'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 8 }}>{error}</div>}

      <form className="form-row" onSubmit={save}>
        <input
          className="text-input"
          type="password"
          placeholder={KEY_PLACEHOLDERS[provider] || 'Clé API...'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={saving || !apiKey.trim()}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {configured && (
          <button type="button" className="btn" onClick={remove} disabled={saving}>
            Retirer
          </button>
        )}
      </form>
    </div>
  )
}

function AiSettingsPanel() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [activatingProvider, setActivatingProvider] = useState(null)

  const load = () => {
    api.getAiStatus().then(setStatus).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const activate = async (provider) => {
    setActivatingProvider(provider)
    setError(null)
    try {
      await api.setActiveAiProvider(provider)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActivatingProvider(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Paramètres IA</p>
      </div>

      <p className="backup-hint">
        Clé API utilisée pour générer un brouillon de résumé de rapport ou reformuler un texte. Chaque
        fournisseur garde sa propre clé, stockée localement sur cet ordinateur — jamais dans les
        sauvegardes exportées. Un seul fournisseur est actif à la fois.
      </p>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}

      {!status && <p className="page-date" style={{ margin: 0 }}>Chargement…</p>}

      {status &&
        Object.entries(status.providers).map(([provider, info]) => (
          <ProviderKeyRow
            key={provider}
            provider={provider}
            label={info.label}
            configured={info.configured}
            isActive={status.activeProvider === provider}
            activating={activatingProvider === provider}
            onSaved={load}
            onRemoved={load}
            onActivate={activate}
          />
        ))}
    </div>
  )
}

function TeacherProfilePanel() {
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    auth.getProfile().then(setProfile).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const startEditing = () => {
    setError(null)
    setForm({
      nomComplet: profile.nomComplet || '',
      courriel: profile.courriel || '',
      ecole: profile.ecole || '',
      divisionScolaire: profile.divisionScolaire || '',
      anneeScolaire: profile.anneeScolaire || '',
      titre: profile.titre || '',
    })
    setEditing(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.nomComplet.trim()) {
      setError('Le nom complet est requis.')
      return
    }
    if (!form.courriel.trim() || !form.courriel.includes('@')) {
      setError('Un courriel valide est requis.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await auth.updateProfile(form)
      setProfile(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Mon profil</p>
      </div>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}
      {!profile && <p className="page-date" style={{ margin: 0 }}>Chargement…</p>}

      {profile && !editing && (
        <div>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <p className="stat-label">Nom complet</p>
              <p className="stat-value" style={{ fontSize: 15 }}>{profile.nomComplet || '—'}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Courriel</p>
              <p className="stat-value" style={{ fontSize: 15 }}>{profile.courriel || '—'}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Titre</p>
              <p className="stat-value" style={{ fontSize: 15 }}>
                {profile.titre ? TEACHER_TITLE_LABELS[profile.titre] : '—'}
              </p>
            </div>
          </div>
          <p className="page-date" style={{ margin: '0 0 4px' }}>École</p>
          <p style={{ margin: '0 0 12px' }}>{profile.ecole || '—'}</p>
          <p className="page-date" style={{ margin: '0 0 4px' }}>Division scolaire</p>
          <p style={{ margin: '0 0 12px' }}>{profile.divisionScolaire || '—'}</p>
          <p className="page-date" style={{ margin: '0 0 4px' }}>Année scolaire</p>
          <p style={{ margin: '0 0 12px' }}>{profile.anneeScolaire || '—'}</p>
          <button className="btn" onClick={startEditing}>Modifier</button>
        </div>
      )}

      {profile && editing && (
        <form onSubmit={save}>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <input
              className="text-input"
              placeholder="Nom complet"
              value={form.nomComplet}
              onChange={(e) => setForm({ ...form, nomComplet: e.target.value })}
            />
            <input
              className="text-input"
              type="email"
              placeholder="Courriel"
              value={form.courriel}
              onChange={(e) => setForm({ ...form, courriel: e.target.value })}
            />
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <input
              className="text-input"
              placeholder="École"
              value={form.ecole}
              onChange={(e) => setForm({ ...form, ecole: e.target.value })}
            />
            <input
              className="text-input"
              placeholder="Division scolaire"
              value={form.divisionScolaire}
              onChange={(e) => setForm({ ...form, divisionScolaire: e.target.value })}
            />
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <input
              className="text-input"
              placeholder="Année scolaire"
              value={form.anneeScolaire}
              onChange={(e) => setForm({ ...form, anneeScolaire: e.target.value })}
            />
            <select
              className="text-input"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
            >
              <option value="">Titre — non précisé</option>
              {TEACHER_TITLES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="form-row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function AccountsAdmin() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    auth
      .listAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div>
      <p className="page-date">Gestion des accès</p>
      <h1 className="page-title">Comptes</h1>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Comptes existants</p>
        </div>
        {!accounts && <p className="page-date" style={{ margin: 0 }}>Chargement&hellip;</p>}
        {accounts?.map((account) => (
          <div className="goal-row" key={account.username}>
            <span className="goal-label">
              {account.nomComplet ? `${account.nomComplet} (${account.username})` : account.username}
              {account.titre && (
                <span className="page-date" style={{ display: 'block', margin: 0 }}>
                  {TEACHER_TITLE_LABELS[account.titre] || account.titre}
                </span>
              )}
            </span>
            <span className="tag-mark">{ROLE_LABELS[account.role] || account.role}</span>
          </div>
        ))}
      </div>

      <TeacherProfilePanel />

      <NewEaForm onCreated={load} />

      <AiSettingsPanel />
    </div>
  )
}
