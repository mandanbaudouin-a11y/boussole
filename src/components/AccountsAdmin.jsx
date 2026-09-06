import { useEffect, useState } from 'react'
import { auth } from '../auth'
import { api } from '../api'
import { TEACHER_TITLES, TEACHER_TITLE_LABELS } from '../teacherTitles'
import { useLanguage } from '../i18n/LanguageContext'

const ROLE_LABELS = { enseignant: 'Enseignant', ea: 'EA' }

function NewEaForm({ onCreated }) {
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (username.trim().length < 3) {
      setError(t("Le nom d'utilisateur doit contenir au moins 3 caractères."))
      return
    }
    if (password.length < 8) {
      setError(t('Le mot de passe doit contenir au moins 8 caractères.'))
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
        <p className="student-name" style={{ cursor: 'default' }}>{t('Créer un compte EA')}</p>
      </div>
      {error && <div className="alert alert-urgent" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-row">
        <input
          className="text-input"
          placeholder={t("Nom d'utilisateur")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="text-input"
          type="password"
          placeholder={t('Mot de passe (8 caractères min.)')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('Création...') : t('Créer le compte')}
        </button>
      </div>
    </form>
  )
}

function NewCollaboratorForm({ onCreated }) {
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nomComplet, setNomComplet] = useState('')
  const [titre, setTitre] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (username.trim().length < 3) {
      setError(t("Le nom d'utilisateur doit contenir au moins 3 caractères."))
      return
    }
    if (password.length < 8) {
      setError(t('Le mot de passe doit contenir au moins 8 caractères.'))
      return
    }
    if (!nomComplet.trim()) {
      setError(t('Le nom complet est requis.'))
      return
    }
    setSaving(true)
    try {
      await auth.createEnseignantAccount(username.trim(), password, nomComplet.trim(), titre || undefined)
      setUsername('')
      setPassword('')
      setNomComplet('')
      setTitre('')
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
        <p className="student-name" style={{ cursor: 'default' }}>{t('Ajouter un enseignant collaborateur')}</p>
      </div>
      <p className="backup-hint">
        {t("Pour un enseignant-ressource ou tout autre collègue qui doit pouvoir consulter et modifier les mêmes PEI (pas seulement ajouter des notes comme un compte EA). Ce compte a les mêmes droits complets que le vôtre.")}
      </p>
      {error && <div className="alert alert-urgent" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="form-row" style={{ flexWrap: 'wrap' }}>
        <input
          className="text-input"
          placeholder={t('Nom complet')}
          value={nomComplet}
          onChange={(e) => setNomComplet(e.target.value)}
        />
        <select className="text-input" value={titre} onChange={(e) => setTitre(e.target.value)}>
          <option value="">{t('Titre — non précisé')}</option>
          {TEACHER_TITLES.map((tt) => (
            <option key={tt.value} value={tt.value}>{t(tt.label)}</option>
          ))}
        </select>
      </div>
      <div className="form-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <input
          className="text-input"
          placeholder={t("Nom d'utilisateur")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="text-input"
          type="password"
          placeholder={t('Mot de passe (8 caractères min.)')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('Création...') : t('Créer le compte')}
        </button>
      </div>
    </form>
  )
}

function NetworkSettingsPanel() {
  const { t } = useLanguage()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justChanged, setJustChanged] = useState(false)

  const load = () => {
    api.getNetworkSettings().then(setSettings).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const toggle = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.setNetworkSettings(!settings.lanSharingEnabled)
      setSettings(updated)
      setJustChanged(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Réseau local')}</p>
      </div>

      <p className="backup-hint">
        {t("Permet à un collègue sur le même réseau Wi-Fi de l'école (ex. un enseignant-ressource) d'ouvrir Repère dans son navigateur, sans rien installer. À n'activer que sur le réseau de l'école — jamais sur un réseau public.")}
      </p>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}
      {!settings && <p className="page-date" style={{ margin: 0 }}>{t('Chargement…')}</p>}

      {settings && (
        <>
          <div className="form-row" style={{ alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="lan-sharing-toggle"
              checked={settings.lanSharingEnabled}
              onChange={toggle}
              disabled={saving}
            />
            <label htmlFor="lan-sharing-toggle">{t("Partager sur le réseau local de l'école")}</label>
          </div>

          {settings.lanSharingEnabled && (
            <div style={{ marginTop: 14 }}>
              {settings.lanAddresses.length > 0 ? (
                <>
                  <p className="page-date" style={{ margin: '0 0 4px' }}>{t('Adresse à communiquer au collègue')}</p>
                  {settings.lanAddresses.map((addr) => (
                    <p key={addr} style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)' }}>
                      {`http://${addr}:${settings.port}`}
                    </p>
                  ))}
                </>
              ) : (
                <p className="page-date" style={{ margin: 0 }}>
                  {t("Aucune adresse réseau détectée pour l'instant — vérifiez que cet ordinateur est bien connecté au réseau de l'école.")}
                </p>
              )}
            </div>
          )}

          {justChanged && (
            <div className="alert alert-warning" style={{ marginTop: 14 }}>
              {t('Fermez complètement Repère puis rouvrez-le pour appliquer ce changement.')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AssignmentsPanel({ accounts }) {
  const { t } = useLanguage()
  const [assignments, setAssignments] = useState(null)
  const [error, setError] = useState(null)
  const [resourceUsername, setResourceUsername] = useState('')
  const [ownerUsername, setOwnerUsername] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    auth.getAssignments().then(setAssignments).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const teacherAccounts = (accounts || []).filter((a) => a.role === 'enseignant')

  const submit = async (e) => {
    e.preventDefault()
    if (!resourceUsername || !ownerUsername) return
    setSaving(true)
    setError(null)
    try {
      await auth.createAssignment(resourceUsername, ownerUsername)
      setResourceUsername('')
      setOwnerUsername('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    setError(null)
    try {
      await auth.deleteAssignment(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Assignations')}</p>
      </div>
      <p className="backup-hint">
        {t("Donne à un compte enseignant collaborateur (ex. un enseignant-ressource) accès aux élèves d'un autre compte enseignant. Prend effet immédiatement, sans reconnexion.")}
      </p>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}
      {!assignments && <p className="page-date" style={{ margin: 0 }}>{t('Chargement…')}</p>}

      {assignments && assignments.length === 0 && (
        <p className="page-date" style={{ margin: '0 0 14px' }}>{t("Aucune assignation pour l'instant.")}</p>
      )}

      {assignments && assignments.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {assignments.map((a) => (
            <div className="goal-row" key={a.id}>
              <span className="goal-label">
                {t('{resource} → élèves de {owner}', {
                  resource: a.resourceNomComplet || a.resourceUsername,
                  owner: a.ownerNomComplet || a.ownerUsername,
                })}
              </span>
              <button type="button" className="btn" onClick={() => remove(a.id)}>{t('Retirer')}</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="form-row" style={{ flexWrap: 'wrap' }}>
        <select className="text-input" value={resourceUsername} onChange={(e) => setResourceUsername(e.target.value)}>
          <option value="">{t('Compte collaborateur')}</option>
          {teacherAccounts.map((a) => (
            <option key={a.username} value={a.username}>{a.nomComplet || a.username}</option>
          ))}
        </select>
        <select className="text-input" value={ownerUsername} onChange={(e) => setOwnerUsername(e.target.value)}>
          <option value="">{t('Donner accès aux élèves de')}</option>
          {teacherAccounts.map((a) => (
            <option key={a.username} value={a.username}>{a.nomComplet || a.username}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={saving || !resourceUsername || !ownerUsername}>
          {saving ? t('Enregistrement...') : t('Assigner')}
        </button>
      </form>
    </div>
  )
}

const KEY_PLACEHOLDERS = {
  anthropic: 'sk-ant-...',
  mistral: 'Clé API Mistral...',
}

function ProviderKeyRow({ provider, label, configured, isActive, activating, onSaved, onRemoved, onActivate }) {
  const { t } = useLanguage()
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
    if (!confirm(t('Retirer la clé API {label} ? La génération par ce fournisseur sera désactivée.', { label }))) return
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
          {isActive && <span className="status-badge status-atteint">{t('Actif')}</span>}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="page-date" style={{ margin: 0 }}>{configured ? t('clé configurée') : t('aucune clé')}</span>
          {!isActive && configured && (
            <button className="btn" onClick={() => onActivate(provider)} disabled={activating}>
              {activating ? t('Activation...') : t('Rendre actif')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 8 }}>{error}</div>}

      <form className="form-row" onSubmit={save}>
        <input
          className="text-input"
          type="password"
          placeholder={KEY_PLACEHOLDERS[provider] || t('Clé API...')}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={saving || !apiKey.trim()}>
          {saving ? t('Enregistrement...') : t('Enregistrer')}
        </button>
        {configured && (
          <button type="button" className="btn" onClick={remove} disabled={saving}>
            {t('Retirer')}
          </button>
        )}
      </form>
    </div>
  )
}

function AiSettingsPanel() {
  const { t } = useLanguage()
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
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Paramètres IA')}</p>
      </div>

      <p className="backup-hint">
        {t('Clé API utilisée pour générer un brouillon de résumé de rapport ou reformuler un texte. Chaque fournisseur garde sa propre clé, stockée localement sur cet ordinateur — jamais dans les sauvegardes exportées. Un seul fournisseur est actif à la fois.')}
      </p>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}

      {!status && <p className="page-date" style={{ margin: 0 }}>{t('Chargement…')}</p>}

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
  const { t } = useLanguage()
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
      setError(t('Le nom complet est requis.'))
      return
    }
    if (!form.courriel.trim() || !form.courriel.includes('@')) {
      setError(t('Un courriel valide est requis.'))
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
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Mon profil')}</p>
      </div>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}
      {!profile && <p className="page-date" style={{ margin: 0 }}>{t('Chargement…')}</p>}

      {profile && !editing && (
        <div>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <p className="stat-label">{t('Nom complet')}</p>
              <p className="stat-value" style={{ fontSize: 15 }}>{profile.nomComplet || t('—')}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">{t('Courriel')}</p>
              <p className="stat-value" style={{ fontSize: 15 }}>{profile.courriel || t('—')}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">{t('Titre')}</p>
              <p className="stat-value" style={{ fontSize: 15 }}>
                {profile.titre ? t(TEACHER_TITLE_LABELS[profile.titre]) : t('—')}
              </p>
            </div>
          </div>
          <p className="page-date" style={{ margin: '0 0 4px' }}>{t('École')}</p>
          <p style={{ margin: '0 0 12px' }}>{profile.ecole || t('—')}</p>
          <p className="page-date" style={{ margin: '0 0 4px' }}>{t('Division scolaire')}</p>
          <p style={{ margin: '0 0 12px' }}>{profile.divisionScolaire || t('—')}</p>
          <p className="page-date" style={{ margin: '0 0 4px' }}>{t('Année scolaire')}</p>
          <p style={{ margin: '0 0 12px' }}>{profile.anneeScolaire || t('—')}</p>
          <button className="btn" onClick={startEditing}>{t('Modifier')}</button>
        </div>
      )}

      {profile && editing && (
        <form onSubmit={save}>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <input
              className="text-input"
              placeholder={t('Nom complet')}
              value={form.nomComplet}
              onChange={(e) => setForm({ ...form, nomComplet: e.target.value })}
            />
            <input
              className="text-input"
              type="email"
              placeholder={t('Courriel')}
              value={form.courriel}
              onChange={(e) => setForm({ ...form, courriel: e.target.value })}
            />
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <input
              className="text-input"
              placeholder={t('École')}
              value={form.ecole}
              onChange={(e) => setForm({ ...form, ecole: e.target.value })}
            />
            <input
              className="text-input"
              placeholder={t('Division scolaire')}
              value={form.divisionScolaire}
              onChange={(e) => setForm({ ...form, divisionScolaire: e.target.value })}
            />
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <input
              className="text-input"
              placeholder={t('Année scolaire')}
              value={form.anneeScolaire}
              onChange={(e) => setForm({ ...form, anneeScolaire: e.target.value })}
            />
            <select
              className="text-input"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
            >
              <option value="">{t('Titre — non précisé')}</option>
              {TEACHER_TITLES.map((tt) => (
                <option key={tt.value} value={tt.value}>{t(tt.label)}</option>
              ))}
            </select>
          </div>
          <div className="form-row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('Enregistrement...') : t('Enregistrer')}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
              {t('Annuler')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function AccountsAdmin() {
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState(null)
  const [isOwner, setIsOwner] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    auth
      .listAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message))
  }

  useEffect(load, [])
  useEffect(() => {
    auth.getProfile().then((p) => setIsOwner(p.isOwner)).catch(() => setIsOwner(false))
  }, [])

  return (
    <div>
      <p className="page-date">{t('Gestion des accès')}</p>
      <h1 className="page-title">{t('Comptes')}</h1>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Comptes existants')}</p>
        </div>
        {!accounts && <p className="page-date" style={{ margin: 0 }}>{t('Chargement…')}</p>}
        {accounts?.map((account) => (
          <div className="goal-row" key={account.username}>
            <span className="goal-label">
              {account.nomComplet ? `${account.nomComplet} (${account.username})` : account.username}
              {account.titre && (
                <span className="page-date" style={{ display: 'block', margin: 0 }}>
                  {t(TEACHER_TITLE_LABELS[account.titre]) || account.titre}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {account.isOwner && <span className="status-badge status-atteint">{t('Propriétaire')}</span>}
              <span className="tag-mark">{t(ROLE_LABELS[account.role]) || account.role}</span>
            </span>
          </div>
        ))}
      </div>

      <TeacherProfilePanel />

      {isOwner && (
        <>
          <NewEaForm onCreated={load} />

          <NewCollaboratorForm onCreated={load} />

          <AssignmentsPanel accounts={accounts} />

          <NetworkSettingsPanel />
        </>
      )}

      <AiSettingsPanel />
    </div>
  )
}
