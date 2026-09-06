import { useState, useEffect, useRef } from 'react'
import { GoalRow, AddGoalRow } from './GoalList'
import { GOAL_STATUS_LABELS, GOAL_STATUS_ICONS, formatHistoryDate } from '../goalStatus'
import { STRATEGY_CATEGORY_LABELS } from '../strategyCategories'
import { reviewDaysLabel } from '../reviewDate'
import {
  ADAPTATION_SUBTYPES,
  ADAPTATION_SUBTYPE_LABELS,
  MODIFICATION_TYPES,
  MODIFICATION_TYPE_LABELS,
} from '../adaptationTypes'
import {
  CONSULTATION_METHOD_SUGGESTIONS,
  ACKNOWLEDGMENT_STATUSES,
  ACKNOWLEDGMENT_STATUS_LABELS,
} from '../consultationTypes'
import { api } from '../api'
import { triggerBlobDownload } from '../downloadBlob'
import { initials, avatarColor } from '../avatar'
import { useLanguage } from '../i18n/LanguageContext'
import { useConfirm } from '../ConfirmContext'

function formatDate(dateStr, lang) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function StudentHeader({ student, canEdit, onEditStudent, onRemoveStudent }) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(student.name)
  const [grade, setGrade] = useState(student.grade)
  const [nextReviewDate, setNextReviewDate] = useState(student.nextReviewDate)
  const [birthdate, setBirthdate] = useState(student.birthdate || '')

  const save = () => {
    if (!name.trim() || !grade.trim()) return
    onEditStudent(student.id, {
      name: name.trim(),
      grade: grade.trim(),
      nextReviewDate: nextReviewDate || student.nextReviewDate,
      birthdate,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card new-student-form" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="text-input" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
            {t('Prochaine révision du PEI')}
            <input
              className="text-input"
              type="date"
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
            {t('Date de naissance (optionnel)')}
            <input
              className="text-input"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={save}>{t('Enregistrer')}</button>
          <button className="btn" onClick={() => setEditing(false)}>{t('Annuler')}</button>
        </div>
      </div>
    )
  }

  const late = student.reviewInDays < 0

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="avatar" style={{ width: 56, height: 56, fontSize: 20, borderRadius: 18, background: avatarColor(student.id) }}>
          {initials(student.name)}
        </div>
        <div>
          <p className="page-date" style={{ margin: '0 0 4px' }}>{student.grade}</p>
          <h1 className="page-title" style={{ margin: 0 }}>{student.name}</h1>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className={`review-pill ${late ? 'late' : 'ok'}`}>
          {late ? t('Révision en retard') : t('Révision à jour')}
        </span>
        {canEdit && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>{t('Modifier')}</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (await confirm(t('Supprimer {name} et tous ses objectifs ? Cette action est irréversible.', { name: student.name })))
                  onRemoveStudent(student.id)
              }}
            >
              {t("Supprimer l'élève")}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddNoteForm({ studentId, onAddNote }) {
  const { t } = useLanguage()
  const [text, setText] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAddNote(studentId, text.trim())
    setText('')
  }

  return (
    <form className="form-row" style={{ marginTop: 10 }} onSubmit={submit}>
      <input
        className="text-input"
        placeholder={t('+ Ajouter une note')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn">{t('Ajouter')}</button>
    </form>
  )
}

function EditableTextSection({ title, value, canEdit, studentId, field, suggestions = [], onSave }) {
  const { t, lang } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const startEditing = () => {
    setError(null)
    setDraft(value || '')
    setEditing(true)
  }

  // Ajoute une formulation suggerée à la suite du texte existant plutôt que
  // de le remplacer : forces/besoins se composent typiquement de plusieurs
  // phrases, contrairement aux stratégies/adaptations qui sont des éléments
  // distincts d'une liste.
  const appendSuggestion = (label) => {
    setDraft((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return label
      return `${trimmed}${/[.!?]$/.test(trimmed) ? '' : '.'} ${label}`
    })
  }

  const suggest = async () => {
    setError(null)
    setSuggesting(true)
    try {
      const { suggestion } = await api.suggestFieldText(studentId, field, draft, lang)
      setDraft(suggestion)
    } catch (err) {
      setError(err.message)
    } finally {
      setSuggesting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setError(null)
    setEditing(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{title}</p>
      </div>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}

      {editing ? (
        <div>
          <textarea
            className="text-input"
            style={{ width: '100%', minHeight: 120, fontFamily: 'inherit', lineHeight: 1.6 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="page-date" style={{ margin: '0 0 6px' }}>{t('Suggestions — cliquer pour ajouter')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="suggestion-chip"
                    onClick={() => appendSuggestion(s.label)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? t('Enregistrement...') : t('Enregistrer')}
            </button>
            <button className="btn" onClick={suggest} disabled={suggesting || saving}>
              {suggesting ? t('Suggestion...') : t("Suggérer une formulation avec l'IA")}
            </button>
            <button className="btn" onClick={cancel} disabled={saving}>
              {t('Annuler')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="report-body">{value && value.trim() ? value : t('Aucune information enregistrée.')}</p>
          {canEdit && (
            <button className="btn" style={{ marginTop: 8 }} onClick={startEditing}>{t('Modifier')}</button>
          )}
        </div>
      )}
    </div>
  )
}

function ProfilTab({ student, canEdit, onEditStudent, forcesBesoinsLibrary }) {
  const { t } = useLanguage()
  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <p className="stat-label">{t('Niveau')}</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{student.grade}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{t('Âge')}</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{student.age !== null ? t('{n} ans', { n: student.age }) : t('—')}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{t('Prochaine révision')}</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{reviewDaysLabel(student.reviewInDays, t)}</p>
        </div>
      </div>

      {(student.age === null || student.age < 14) && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Plan de transition')}</p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              className="goal-check"
              checked={student.applicableTransition}
              disabled={!canEdit}
              onChange={(e) => onEditStudent(student.id, { applicableTransition: e.target.checked })}
            />
            {t('Applicable pour cet élève (même si moins de 14 ans)')}
          </label>
        </div>
      )}

      <EditableTextSection
        title={t('Forces')}
        value={student.forces}
        canEdit={canEdit}
        studentId={student.id}
        field="forces"
        suggestions={forcesBesoinsLibrary.filter((e) => e.field === 'forces')}
        onSave={(text) => onEditStudent(student.id, { forces: text })}
      />
      <EditableTextSection
        title={t('Besoins')}
        value={student.besoins}
        canEdit={canEdit}
        studentId={student.id}
        field="besoins"
        suggestions={forcesBesoinsLibrary.filter((e) => e.field === 'besoins')}
        onSave={(text) => onEditStudent(student.id, { besoins: text })}
      />
    </div>
  )
}

function ObjectifsTab({
  student,
  canEdit,
  onAddGoal,
  onEditGoal,
  onRemoveGoal,
  onChangeGoalStatus,
  onAddStrategy,
  onRemoveStrategy,
  strategiesLibrary,
  onAddNote,
}) {
  const { t } = useLanguage()
  const achievedCount = student.goals.filter((g) => g.status === 'atteint' || g.status === 'depasse').length
  const latestRate = student.weeklyRate.length
    ? student.weeklyRate[student.weeklyRate.length - 1].pct
    : 0

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <p className="stat-label">{t('Objectifs actifs')}</p>
          <p className="stat-value">{student.goals.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{t('Objectifs atteints')}</p>
          <p className="stat-value">{achievedCount}/{student.goals.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{t('Taux, semaine en cours')}</p>
          <p className="stat-value">{latestRate}%</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Objectifs')}</p>
        </div>
        {student.goals.map((goal) => (
          <GoalRow
            key={goal.id}
            studentId={student.id}
            goal={goal}
            onEditGoal={onEditGoal}
            onRemoveGoal={onRemoveGoal}
            onChangeStatus={onChangeGoalStatus}
            onAddStrategy={onAddStrategy}
            onRemoveStrategy={onRemoveStrategy}
            strategiesLibrary={strategiesLibrary}
            canEdit={canEdit}
          />
        ))}
        {canEdit && <AddGoalRow studentId={student.id} onAddGoal={onAddGoal} />}
      </div>

      {student.weeklyRate.length > 0 && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Progrès sur 4 semaines')}</p>
          </div>
          {student.weeklyRate.map((w) => (
            <div className="week-row" key={w.week}>
              <span className="week-label">{w.week}</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${w.pct}%` }} />
              </div>
              <span className="week-pct">{w.pct}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Notes récentes')}</p>
        </div>
        {student.notes.length === 0 && <p className="page-date" style={{ margin: 0 }}>{t('Aucune note pour le moment.')}</p>}
        {student.notes.map((note, i) => (
          <div className="goal-row" key={note.id ?? i} style={{ alignItems: 'flex-start' }}>
            <span className="week-label" style={{ width: 60 }}>{note.date}</span>
            <span className="goal-label">{note.text}</span>
          </div>
        ))}
        <AddNoteForm studentId={student.id} onAddNote={onAddNote} />
      </div>
    </div>
  )
}

function PlaceholderTab({ sections }) {
  return (
    <div>
      {sections.map((title) => (
        <div className="card" key={title}>
          <div className="card-header">
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{title}</p>
          </div>
          <p className="tab-placeholder" style={{ padding: '4px 0' }}>
            Cette section sera ajoutée dans une prochaine mise à jour.
          </p>
        </div>
      ))}
    </div>
  )
}

function AddAdaptationForm({ studentId, goals, adaptationsLibrary, onAdd }) {
  const { t } = useLanguage()
  const [subtype, setSubtype] = useState('pedagogique')
  const [goalId, setGoalId] = useState('')
  const [description, setDescription] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const submitDescription = (rawDescription) => {
    const trimmed = rawDescription.trim()
    if (!trimmed) return
    onAdd(studentId, { subtype, description: trimmed, goalId: goalId || null })
    setDescription('')
    setGoalId('')
    setShowSuggestions(false)
  }

  const filtered = adaptationsLibrary.filter(
    (a) => a.subtype === subtype && a.label.toLowerCase().includes(description.trim().toLowerCase())
  )

  return (
    <form className="form-row strategy-autocomplete" style={{ marginTop: 10, flexWrap: 'wrap' }} ref={wrapperRef} onSubmit={(e) => { e.preventDefault(); submitDescription(description) }}>
      <select className="text-input" style={{ maxWidth: 170 }} value={subtype} onChange={(e) => setSubtype(e.target.value)}>
        {ADAPTATION_SUBTYPES.map((s) => (
          <option key={s.value} value={s.value}>{t(s.label)}</option>
        ))}
      </select>
      <select className="text-input" style={{ maxWidth: 220 }} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
        <option value="">{t('Générale (non liée à un objectif)')}</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
        <input
          className="text-input"
          style={{ width: '100%' }}
          placeholder={t("Description (suggestion ou texte libre)")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
        />
        {showSuggestions && filtered.length > 0 && (
          <div className="strategy-suggestions">
            {filtered.map((a) => (
              <button type="button" key={a.id} className="strategy-suggestion-item" onClick={() => submitDescription(a.label)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="submit" className="btn">{t('Ajouter')}</button>
    </form>
  )
}

function AdaptationRow({ adaptation, canEdit, onRemove }) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  return (
    <div className="goal-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <span className="strategy-category" style={{ marginRight: 8 }}>
          {t(ADAPTATION_SUBTYPE_LABELS[adaptation.subtype]) || adaptation.subtype}
        </span>
        <span className="goal-label">{adaptation.description}</span>
        {adaptation.goalLabel && (
          <p className="page-date" style={{ margin: '4px 0 0' }}>{t('Liée à : {label}', { label: adaptation.goalLabel })}</p>
        )}
      </div>
      {canEdit && (
        <button
          className="icon-btn icon-btn-danger"
          onClick={async () => {
            if (await confirm(t('Retirer cette adaptation ?'))) onRemove()
          }}
          title={t('Retirer')}
        >
          &times;
        </button>
      )}
    </div>
  )
}

function AddModificationForm({ studentId, onAdd }) {
  const { t } = useLanguage()
  const [type, setType] = useState('niveau_scolaire_different')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!description.trim() || !subject.trim()) return
    onAdd(studentId, { type, subject: subject.trim(), description: description.trim() })
    setSubject('')
    setDescription('')
  }

  return (
    <form className="form-row" style={{ marginTop: 10, flexWrap: 'wrap' }} onSubmit={submit}>
      <select className="text-input" style={{ maxWidth: 200 }} value={type} onChange={(e) => setType(e.target.value)}>
        {MODIFICATION_TYPES.map((m) => (
          <option key={m.value} value={m.value}>{t(m.label)}</option>
        ))}
      </select>
      <input
        className="text-input"
        style={{ maxWidth: 160 }}
        placeholder={t('Matière concernée')}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <input
        className="text-input"
        style={{ flex: 1, minWidth: 200 }}
        placeholder={t("Description du changement d'attente")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn">{t('Ajouter')}</button>
    </form>
  )
}

function ModificationRow({ modification, canEdit, onRemove }) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  return (
    <div className="goal-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <span className="strategy-category" style={{ marginRight: 8 }}>
          {t(MODIFICATION_TYPE_LABELS[modification.type]) || modification.type}
        </span>
        <span className="goal-label">{modification.description}</span>
        <p className="page-date" style={{ margin: '4px 0 0' }}>{t('Matière : {subject}', { subject: modification.subject })}</p>
      </div>
      {canEdit && (
        <button
          className="icon-btn icon-btn-danger"
          onClick={async () => {
            if (await confirm(t('Retirer cette modification ?'))) onRemove()
          }}
          title={t('Retirer')}
        >
          &times;
        </button>
      )}
    </div>
  )
}

function AdaptationsModificationsTab({
  student,
  canEdit,
  adaptationsLibrary,
  onAddAdaptation,
  onRemoveAdaptation,
  onAddModification,
  onRemoveModification,
}) {
  const { t } = useLanguage()
  return (
    <div>
      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Adaptations')}</p>
        </div>
        {student.adaptations.length === 0 && (
          <p className="page-date" style={{ margin: 0 }}>{t('Aucune adaptation enregistrée.')}</p>
        )}
        {student.adaptations.map((a) => (
          <AdaptationRow
            key={a.id}
            adaptation={a}
            canEdit={canEdit}
            onRemove={() => onRemoveAdaptation(student.id, a.id)}
          />
        ))}
        {canEdit && (
          <AddAdaptationForm
            studentId={student.id}
            goals={student.goals}
            adaptationsLibrary={adaptationsLibrary}
            onAdd={onAddAdaptation}
          />
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Modifications')}</p>
        </div>
        {student.modifications.length === 0 && (
          <p className="page-date" style={{ margin: 0 }}>{t('Aucune modification enregistrée.')}</p>
        )}
        {student.modifications.map((m) => (
          <ModificationRow
            key={m.id}
            modification={m}
            canEdit={canEdit}
            onRemove={() => onRemoveModification(student.id, m.id)}
          />
        ))}
        {canEdit && <AddModificationForm studentId={student.id} onAdd={onAddModification} />}
      </div>
    </div>
  )
}

function AddTransitionGoalForm({ studentId, onAdd }) {
  const { t } = useLanguage()
  const [description, setDescription] = useState('')
  const [responsible, setResponsible] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [communityResources, setCommunityResources] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!description.trim()) return
    onAdd(studentId, {
      description: description.trim(),
      responsible: responsible.trim() || null,
      targetDate: targetDate || null,
      communityResources: communityResources.trim() || null,
    })
    setDescription('')
    setResponsible('')
    setTargetDate('')
    setCommunityResources('')
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder={t('Objectif de transition (ex. obtenir un emploi à temps partiel)')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <input
          className="text-input"
          style={{ maxWidth: 200 }}
          placeholder={t('Responsable')}
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        />
        <input
          className="text-input"
          type="date"
          style={{ maxWidth: 180 }}
          title={t('Délai prévu')}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder={t('Ressources communautaires')}
          value={communityResources}
          onChange={(e) => setCommunityResources(e.target.value)}
        />
        <button type="submit" className="btn">{t("Ajouter l'objectif")}</button>
      </div>
    </form>
  )
}

function AddTransitionStepForm({ studentId, goalId, onAdd }) {
  const { t } = useLanguage()
  const [description, setDescription] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!description.trim()) return
    onAdd(studentId, goalId, description.trim())
    setDescription('')
  }

  return (
    <form className="form-row" style={{ marginTop: 8 }} onSubmit={submit}>
      <input
        className="text-input"
        style={{ flex: 1 }}
        placeholder={t('+ Ajouter une étape')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn">{t('Ajouter')}</button>
    </form>
  )
}

function TransitionGoalCard({ studentId, goal, canEdit, onRemoveGoal, onAddStep, onRemoveStep }) {
  const { t, lang } = useLanguage()
  const confirm = useConfirm()
  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{goal.description}</p>
        {canEdit && (
          <button
            className="icon-btn icon-btn-danger"
            onClick={async () => {
              if (await confirm(t("Supprimer cet objectif de transition ? Cette action est irréversible.")))
                onRemoveGoal(studentId, goal.id)
            }}
            title={t('Supprimer')}
          >
            &times;
          </button>
        )}
      </div>

      {(goal.responsible || goal.targetDate) && (
        <p className="page-date" style={{ margin: '0 0 4px' }}>
          {goal.responsible && t('Responsable : {name}', { name: goal.responsible })}
          {goal.responsible && goal.targetDate && '  ·  '}
          {goal.targetDate && t('Délai prévu : {date}', { date: formatDate(goal.targetDate, lang) })}
        </p>
      )}
      {goal.communityResources && (
        <p className="page-date" style={{ margin: '0 0 12px' }}>{t('Ressources communautaires')} : {goal.communityResources}</p>
      )}

      <p className="report-section-title" style={{ margin: '8px 0' }}>{t('Étapes')}</p>
      {goal.steps.length === 0 && <p className="page-date" style={{ margin: 0 }}>{t('Aucune étape ajoutée.')}</p>}
      {goal.steps.map((s) => (
        <div className="goal-row" key={s.id}>
          <span className="goal-label">{s.description}</span>
          {canEdit && (
            <button
              className="icon-btn icon-btn-danger"
              onClick={async () => {
                if (await confirm(t('Retirer cette étape ?'))) onRemoveStep(studentId, goal.id, s.id)
              }}
              title={t('Retirer')}
            >
              &times;
            </button>
          )}
        </div>
      ))}
      {canEdit && <AddTransitionStepForm studentId={studentId} goalId={goal.id} onAdd={onAddStep} />}
    </div>
  )
}

function TransitionTab({
  student,
  canEdit,
  onAddTransitionGoal,
  onRemoveTransitionGoal,
  onAddTransitionStep,
  onRemoveTransitionStep,
}) {
  const { t } = useLanguage()
  return (
    <div>
      {student.transitionGoals.length === 0 && (
        <div className="card">
          <p className="page-date" style={{ margin: 0 }}>{t('Aucun objectif de transition enregistré.')}</p>
        </div>
      )}
      {student.transitionGoals.map((g) => (
        <TransitionGoalCard
          key={g.id}
          studentId={student.id}
          goal={g}
          canEdit={canEdit}
          onRemoveGoal={onRemoveTransitionGoal}
          onAddStep={onAddTransitionStep}
          onRemoveStep={onRemoveTransitionStep}
        />
      ))}
      {canEdit && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Ajouter un objectif de transition')}</p>
          </div>
          <AddTransitionGoalForm studentId={student.id} onAdd={onAddTransitionGoal} />
        </div>
      )}
    </div>
  )
}

function ConsultationTab({ student, canEdit, onEditStudent }) {
  const { t, lang } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [consultationDate, setConsultationDate] = useState('')
  const [consultationMethod, setConsultationMethod] = useState('')
  const [copyDeliveryDate, setCopyDeliveryDate] = useState('')
  const [acknowledgmentStatus, setAcknowledgmentStatus] = useState('')
  const [deliveredVersionId, setDeliveredVersionId] = useState('')
  const [versions, setVersions] = useState([])

  const startEditing = async () => {
    setConsultationDate(student.consultationDate || '')
    setConsultationMethod(student.consultationMethod || '')
    setCopyDeliveryDate(student.copyDeliveryDate || '')
    setAcknowledgmentStatus(student.acknowledgmentStatus || '')
    setEditing(true)
    try {
      const list = await api.getReportVersions(student.id)
      setVersions(list)
      // Par defaut, une remise se rattache a la version la plus recente
      // disponible (la spec permet cette association automatique) ; le
      // choix reste modifiable si une version anterieure a ete remise.
      setDeliveredVersionId(String(student.deliveredVersionId || list[0]?.id || ''))
    } catch {
      setVersions([])
    }
  }

  const save = () => {
    onEditStudent(student.id, {
      consultationDate,
      consultationMethod,
      copyDeliveryDate,
      acknowledgmentStatus,
      deliveredVersionId: copyDeliveryDate ? deliveredVersionId || null : null,
    })
    setEditing(false)
  }

  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }

  if (editing) {
    return (
      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Consultation et remise')}</p>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap' }}>
          <label style={fieldStyle}>
            {t('Date de consultation')}
            <input
              className="text-input"
              type="date"
              value={consultationDate}
              onChange={(e) => setConsultationDate(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            {t('Méthode de consultation')}
            <input
              className="text-input"
              list="consultation-methods"
              placeholder={`ex. ${t('Réunion')}`}
              value={consultationMethod}
              onChange={(e) => setConsultationMethod(e.target.value)}
            />
            <datalist id="consultation-methods">
              {CONSULTATION_METHOD_SUGGESTIONS.map((m) => (
                <option key={m} value={t(m)} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          <label style={fieldStyle}>
            {t('Date de remise de copie')}
            <input
              className="text-input"
              type="date"
              value={copyDeliveryDate}
              onChange={(e) => setCopyDeliveryDate(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            {t('Accusé de réception')}
            <select
              className="text-input"
              value={acknowledgmentStatus}
              onChange={(e) => setAcknowledgmentStatus(e.target.value)}
            >
              <option value="">{t('—')}</option>
              {ACKNOWLEDGMENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{t(s.label)}</option>
              ))}
            </select>
          </label>
        </div>

        {copyDeliveryDate && versions.length > 0 && (
          <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
            <label style={{ ...fieldStyle, minWidth: 260 }}>
              {t('Version du rapport remise')}
              <select
                className="text-input"
                value={deliveredVersionId}
                onChange={(e) => setDeliveredVersionId(e.target.value)}
              >
                <option value="">{t('—')}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{formatHistoryDate(v.exportedAt)}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {copyDeliveryDate && versions.length === 0 && (
          <p className="page-date" style={{ marginTop: 14 }}>
            {t("Aucune version exportée à associer pour l'instant — exportez d'abord un rapport en PDF (onglet Rapport).")}
          </p>
        )}

        {student.age !== null && student.age >= 16 && (
          <p className="page-date" style={{ marginTop: 14 }}>
            {t("L'élève a 16 ans ou plus : une copie du PEI doit aussi lui être remise directement.")}
          </p>
        )}

        <div className="form-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save}>{t('Enregistrer')}</button>
          <button className="btn" onClick={() => setEditing(false)}>{t('Annuler')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Consultation et remise')}</p>
        {student.copyDeliveryOverdue && <span className="status-badge status-non_atteint">{t('En retard')}</span>}
      </div>

      <div className="stat-grid" style={{ marginBottom: 4 }}>
        <div className="stat-card">
          <p className="stat-label">{t('Consultation parentale')}</p>
          <p className="stat-value" style={{ fontSize: 15 }}>
            {formatDate(student.consultationDate, lang) || t('Non renseignée')}
          </p>
          {student.consultationMethod && <p className="page-date" style={{ margin: '2px 0 0' }}>{student.consultationMethod}</p>}
        </div>
        <div className="stat-card">
          <p className="stat-label">{t('Remise de copie')}</p>
          <p className="stat-value" style={{ fontSize: 15 }}>
            {formatDate(student.copyDeliveryDate, lang) || t('Non renseignée')}
          </p>
          {student.acknowledgmentStatus && (
            <p className="page-date" style={{ margin: '2px 0 0' }}>
              {t('Accusé : {status}', { status: t(ACKNOWLEDGMENT_STATUS_LABELS[student.acknowledgmentStatus]) })}
            </p>
          )}
        </div>
      </div>

      {student.age !== null && student.age >= 16 && (
        <p className="page-date" style={{ margin: '0 0 12px' }}>
          {t("L'élève a 16 ans ou plus : une copie du PEI doit aussi lui être remise directement.")}
        </p>
      )}

      {canEdit && <button className="btn" onClick={startEditing}>{t('Modifier')}</button>}
    </div>
  )
}

function computedSummaryText(student, lang) {
  const achievedCount = student.goals.filter((g) => g.status === 'atteint' || g.status === 'depasse').length
  const hasWeeklyRate = student.weeklyRate.length > 0
  const firstName = student.name.split(' ')[0]

  if (lang === 'en') {
    if (!hasWeeklyRate) {
      return `No weekly history is available yet for ${firstName}. Currently, ${achievedCount} of ${student.goals.length} goal${student.goals.length > 1 ? 's' : ''} ${achievedCount > 1 ? 'are' : 'is'} achieved.`
    }
    const avgRate = Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    const firstRate = student.weeklyRate[0].pct
    const lastRate = student.weeklyRate[student.weeklyRate.length - 1].pct
    return (
      `Over the last ${student.weeklyRate.length} weeks, ${firstName} reached an average success rate ` +
      `of ${avgRate}% across all active goals in their IEP. Currently, ${achievedCount} of ${student.goals.length} goal${student.goals.length > 1 ? 's' : ''} ${achievedCount > 1 ? 'are' : 'is'} achieved. The weekly ` +
      `trend is ${lastRate >= firstRate ? 'trending up' : 'stable'}, moving ` +
      `from ${firstRate}% in week 1 to ${lastRate}% in week ${student.weeklyRate.length}.`
    )
  }

  if (!hasWeeklyRate) {
    return `Aucun historique hebdomadaire n'est encore disponible pour ${firstName}. Actuellement, ${achievedCount} objectif${achievedCount > 1 ? 's' : ''} sur ${student.goals.length} ${achievedCount > 1 ? 'sont atteints' : 'est atteint'}.`
  }

  const avgRate = Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
  const firstRate = student.weeklyRate[0].pct
  const lastRate = student.weeklyRate[student.weeklyRate.length - 1].pct

  return (
    `Sur les ${student.weeklyRate.length} dernières semaines, ${firstName} a atteint un taux moyen de ` +
    `réussite de ${avgRate}% sur l'ensemble des objectifs actifs de son PEI. Actuellement, ${achievedCount} objectif${achievedCount > 1 ? 's' : ''} sur ${student.goals.length} ${achievedCount > 1 ? 'sont atteints' : 'est atteint'}. La tendance ` +
    `hebdomadaire est ${lastRate >= firstRate ? 'à la hausse' : 'stable'}, passant ` +
    `de ${firstRate}% en semaine 1 à ${lastRate}% en semaine ${student.weeklyRate.length}.`
  )
}

function ReportSummary({ student, canEdit, onSave }) {
  const { t, lang } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const hasNarrative = !!(student.narrativeReport && student.narrativeReport.trim())
  const displayedText = hasNarrative ? student.narrativeReport : computedSummaryText(student, lang)

  const startEditing = () => {
    setError(null)
    setDraft(student.narrativeReport || '')
    setEditing(true)
  }

  const generate = async () => {
    if (editing && !confirm(t("Régénérer un nouveau brouillon avec l'IA ? Le texte actuel dans la zone de modification sera remplacé."))) {
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const { draft: generated } = await api.generateAiReport(student.id, lang)
      setDraft(generated)
      setEditing(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(student.id, draft.trim())
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setError(null)
    setEditing(false)
  }

  const clearNarrative = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(student.id, '')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className="report-section-title">{t('Résumé')}</p>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{error}</div>}

      {editing ? (
        <div>
          <textarea
            className="text-input"
            style={{ width: '100%', minHeight: 220, fontFamily: 'inherit', lineHeight: 1.6 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving || !draft.trim()}>
              {saving ? t('Enregistrement...') : t('Enregistrer ce résumé')}
            </button>
            <button className="btn" onClick={generate} disabled={generating || saving}>
              {generating ? t('Génération...') : t("Régénérer avec l'IA")}
            </button>
            <button className="btn" onClick={cancel} disabled={saving}>
              {t('Annuler')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="report-body">{displayedText}</p>
          {canEdit && (
            <div className="form-row" style={{ marginTop: 8 }}>
              {hasNarrative ? (
                <>
                  <button className="btn" onClick={startEditing}>{t('Modifier')}</button>
                  <button className="btn" onClick={generate} disabled={generating}>
                    {generating ? t('Génération...') : t("Régénérer avec l'IA")}
                  </button>
                  <button className="btn" onClick={clearNarrative} disabled={saving}>
                    {t('Revenir au résumé automatique')}
                  </button>
                </>
              ) : (
                <button className="btn" onClick={generate} disabled={generating}>
                  {generating ? t('Génération en cours...') : t("Générer un résumé avec l'IA")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Consultation en lecture seule d'une version passée du rapport, à partir du
// content_snapshot enregistré au moment de l'export — jamais du contenu
// actuel de l'élève, qui a pu changer depuis (le PEI reste un document vivant).
function ReportVersionViewer({ versionId, onClose }) {
  const { t } = useLanguage()
  const [version, setVersion] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getReportVersion(versionId).then(
      (v) => { if (!cancelled) setVersion(v) },
      (err) => { if (!cancelled) setError(err.message) }
    )
    return () => { cancelled = true }
  }, [versionId])

  const snapshot = version?.snapshot

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        {error && <div className="alert alert-urgent">{error}</div>}
        {!snapshot && !error && <p>{t('Chargement de la version...')}</p>}
        {snapshot && (
          <>
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              {t("Cette version est en lecture seule : elle reflète le PEI tel qu'il était au moment de l'export, pas son contenu actuel.")}
            </div>

            <p className="report-header-date" style={{ marginBottom: 4 }}>
              {t('Version exportée le {date}', { date: formatHistoryDate(version.exportedAt) })}
              {version.exportedBy && ` — ${t('par {who}', { who: version.exportedBy })}`}
            </p>
            <h2 className="report-title">{snapshot.name} &mdash; {snapshot.grade}</h2>

            {snapshot.forces && (
              <>
                <p className="report-section-title">{t('Forces')}</p>
                <p className="report-body">{snapshot.forces}</p>
              </>
            )}
            {snapshot.besoins && (
              <>
                <p className="report-section-title">{t('Besoins')}</p>
                <p className="report-body">{snapshot.besoins}</p>
              </>
            )}

            <p className="report-section-title">{t('Objectifs suivis')}</p>
            {snapshot.goals.map((goal) => (
              <div className="report-goal-block" key={goal.id}>
                <div className="report-goal-line">
                  <span>{goal.label}</span>
                  <span className={`status-badge status-${goal.status}`}>
                    <span className="status-icon">{GOAL_STATUS_ICONS[goal.status]}</span>
                    {t(GOAL_STATUS_LABELS[goal.status])}
                  </span>
                </div>
              </div>
            ))}

            {snapshot.adaptations.length > 0 && (
              <>
                <p className="report-section-title">{t('Adaptations')}</p>
                {snapshot.adaptations.map((a) => (
                  <div className="report-goal-line" key={a.id}>
                    <span className="week-label" style={{ width: 130 }}>{t(ADAPTATION_SUBTYPE_LABELS[a.subtype])}</span>
                    <span style={{ flex: 1, marginLeft: 12 }}>{a.description}</span>
                  </div>
                ))}
              </>
            )}

            {snapshot.modifications.length > 0 && (
              <>
                <p className="report-section-title">{t('Modifications')}</p>
                {snapshot.modifications.map((m) => (
                  <div className="report-goal-line" key={m.id}>
                    <span className="week-label" style={{ width: 130 }}>{m.subject}</span>
                    <span style={{ flex: 1, marginLeft: 12 }}>{m.description}</span>
                  </div>
                ))}
              </>
            )}

            <p className="report-section-title">{t("Notes de l'enseignant")}</p>
            {snapshot.notes.map((note, i) => (
              <div className="report-goal-line" key={i}>
                <span className="week-label" style={{ width: 60 }}>{note.date}</span>
                <span style={{ flex: 1, marginLeft: 12 }}>{note.text}</span>
              </div>
            ))}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="btn" onClick={onClose}>{t('Fermer')}</button>
        </div>
      </div>
    </div>
  )
}

function ReportVersionsHistory({ studentId, refreshSignal, deliveredVersionId, copyDeliveryDate }) {
  const { t, lang } = useLanguage()
  const [versions, setVersions] = useState(null)
  const [error, setError] = useState(null)
  const [viewingId, setViewingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getReportVersions(studentId).then(
      (list) => { if (!cancelled) setVersions(list) },
      (err) => { if (!cancelled) setError(err.message) }
    )
    return () => { cancelled = true }
  }, [studentId, refreshSignal])

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{t('Historique des exports')}</p>
      </div>
      {error && <div className="alert alert-urgent">{error}</div>}
      {!versions && !error && <p style={{ color: 'var(--ink-soft)' }}>{t("Chargement de l'historique...")}</p>}
      {versions && versions.length === 0 && (
        <p style={{ color: 'var(--ink-soft)' }}>{t("Aucun export pour l'instant. Le rapport n'a jamais été exporté en PDF.")}</p>
      )}
      {versions && versions.length > 0 && (
        <div className="status-history-list">
          {versions.map((v) => (
            <div className="status-history-row" key={v.id} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>
                {t('Exporté le {date}', { date: formatHistoryDate(v.exportedAt) })}
                {v.exportedBy && ` — ${t('par {who}', { who: v.exportedBy })}`}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {String(v.id) === String(deliveredVersionId) && (
                  <span className="status-badge status-atteint">
                    {t('Remis à un parent le {date}', { date: formatDate(copyDeliveryDate, lang) })}
                  </span>
                )}
                <button type="button" className="status-history-toggle" onClick={() => setViewingId(v.id)}>
                  {t('Consulter')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {viewingId && <ReportVersionViewer versionId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  )
}

function RapportTab({ student, canEdit, onSaveNarrativeReport }) {
  const { t, lang } = useLanguage()
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  const handleExportPdf = async () => {
    setPdfError(null)
    setExportingPdf(true)
    try {
      const { blob, filename } = await api.downloadStudentReportPdf(student.id, lang)
      triggerBlobDownload(blob, filename)
      setHistoryRefresh((n) => n + 1)
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setExportingPdf(false)
    }
  }

  const hasWeeklyRate = student.weeklyRate.length > 0
  const avgRate = hasWeeklyRate
    ? Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    : 0
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="form-row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={handleExportPdf} disabled={exportingPdf}>
          {exportingPdf ? t('Export en cours...') : t('Exporter en PDF')}
        </button>
      </div>

      {pdfError && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{pdfError}</div>}

      <div className="report-sheet">
        <div className="report-header">
          <div className="brand-row" style={{ marginBottom: 0 }}>
            <img src="/logo-repere-icon.svg" alt="" className="brand-icon" style={{ width: 30, height: 30 }} />
            <div>
              <p className="brand" style={{ fontSize: 18, lineHeight: 1.1 }}>Repère</p>
              <p className="report-meta" style={{ margin: 0 }}>{t("Plan d'enseignement individualisé")}</p>
            </div>
          </div>
          <p className="report-header-date">{t('Généré le {date}', { date: today })}</p>
        </div>

        <h2 className="report-title">{student.name} &mdash; {student.grade}</h2>

        <div className="stat-grid" style={{ marginBottom: 4 }}>
          <div className="stat-card">
            <p className="stat-label">{t('Généré le')}</p>
            <p className="stat-value" style={{ fontSize: 16 }}>{today}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">
              {hasWeeklyRate ? t('Taux moyen, {n} semaines', { n: student.weeklyRate.length }) : t('Taux moyen')}
            </p>
            <p className="stat-value">{avgRate}%</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{t('Objectifs actifs')}</p>
            <p className="stat-value">{student.goals.length}</p>
          </div>
        </div>

        <ReportSummary student={student} canEdit={canEdit} onSave={onSaveNarrativeReport} />

        <p className="report-section-title">{t('Objectifs suivis')}</p>
        {student.goals.map((goal) => (
          <div className="report-goal-block" key={goal.id}>
            <div className="report-goal-line">
              <span>{goal.label}</span>
              <span className={`status-badge status-${goal.status}`}>
                <span className="status-icon">{GOAL_STATUS_ICONS[goal.status]}</span>
                {t(GOAL_STATUS_LABELS[goal.status])}
              </span>
            </div>
            {goal.strategies && goal.strategies.length > 0 && (
              <div className="report-goal-strategies">
                {goal.strategies.map((s) => (
                  <span className="strategy-chip" key={s.id}>
                    {s.category && (
                      <span className="strategy-category">{t(STRATEGY_CATEGORY_LABELS[s.category])}</span>
                    )}
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        <p className="report-section-title">{t("Notes de l'enseignant")}</p>
        {student.notes.map((note, i) => (
          <div className="report-goal-line" key={i}>
            <span className="week-label" style={{ width: 60 }}>{note.date}</span>
            <span style={{ flex: 1, marginLeft: 12 }}>{note.text}</span>
          </div>
        ))}

        <div className={`alert ${student.reviewInDays <= 7 ? 'alert-urgent' : 'alert-warning'}`} style={{ marginTop: 24 }}>
          <span>
            {t("Prochaine révision du PEI {days} — à inscrire à l'ordre du jour de la rencontre parents-école.", { days: reviewDaysLabel(student.reviewInDays, t) })}
          </span>
        </div>
      </div>

      <ReportVersionsHistory
        studentId={student.id}
        refreshSignal={historyRefresh}
        deliveredVersionId={student.deliveredVersionId}
        copyDeliveryDate={student.copyDeliveryDate}
      />
    </div>
  )
}

const BASE_TABS = [
  { key: 'profil', label: 'Profil' },
  { key: 'objectifs', label: 'Objectifs' },
  { key: 'adaptations', label: 'Adaptations / Modifications' },
  { key: 'consultation', label: 'Consultation et remise' },
  { key: 'rapport', label: 'Rapport' },
]

export default function StudentPage({
  student,
  role,
  onBack,
  onPrev,
  onNext,
  positionLabel,
  onAddGoal,
  onEditGoal,
  onRemoveGoal,
  onChangeGoalStatus,
  onAddStrategy,
  onRemoveStrategy,
  strategiesLibrary,
  adaptationsLibrary,
  forcesBesoinsLibrary,
  onAddNote,
  onEditStudent,
  onRemoveStudent,
  onSaveNarrativeReport,
  onAddAdaptation,
  onRemoveAdaptation,
  onAddModification,
  onRemoveModification,
  onAddTransitionGoal,
  onRemoveTransitionGoal,
  onAddTransitionStep,
  onRemoveTransitionStep,
}) {
  const { t } = useLanguage()
  const canEdit = role === 'enseignant'
  const [activeTab, setActiveTab] = useState('objectifs')

  const tabs = [...BASE_TABS]
  if ((student.age !== null && student.age >= 14) || student.applicableTransition) {
    tabs.splice(3, 0, { key: 'transition', label: 'Plan de transition' })
  }

  return (
    <div>
      <div className="student-nav-row">
        <button className="back-link" style={{ marginBottom: 0 }} onClick={onBack}>
          &larr; {t('Retour au tableau de bord')}
        </button>
        <div className="student-nav-arrows">
          {positionLabel && <span className="student-nav-position">{positionLabel}</span>}
          <button className="icon-btn" onClick={onPrev} disabled={!onPrev} title={t('Élève précédent')}>&#8592;</button>
          <button className="icon-btn" onClick={onNext} disabled={!onNext} title={t('Élève suivant')}>&#8594;</button>
        </div>
      </div>

      <StudentHeader
        student={student}
        canEdit={canEdit}
        onEditStudent={onEditStudent}
        onRemoveStudent={onRemoveStudent}
      />

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === 'profil' && (
        <ProfilTab student={student} canEdit={canEdit} onEditStudent={onEditStudent} forcesBesoinsLibrary={forcesBesoinsLibrary} />
      )}

      {activeTab === 'objectifs' && (
        <ObjectifsTab
          student={student}
          canEdit={canEdit}
          onAddGoal={onAddGoal}
          onEditGoal={onEditGoal}
          onRemoveGoal={onRemoveGoal}
          onChangeGoalStatus={onChangeGoalStatus}
          onAddStrategy={onAddStrategy}
          onRemoveStrategy={onRemoveStrategy}
          strategiesLibrary={strategiesLibrary}
          onAddNote={onAddNote}
        />
      )}

      {activeTab === 'adaptations' && (
        <AdaptationsModificationsTab
          student={student}
          canEdit={canEdit}
          adaptationsLibrary={adaptationsLibrary}
          onAddAdaptation={onAddAdaptation}
          onRemoveAdaptation={onRemoveAdaptation}
          onAddModification={onAddModification}
          onRemoveModification={onRemoveModification}
        />
      )}

      {activeTab === 'transition' && (
        <TransitionTab
          student={student}
          canEdit={canEdit}
          onAddTransitionGoal={onAddTransitionGoal}
          onRemoveTransitionGoal={onRemoveTransitionGoal}
          onAddTransitionStep={onAddTransitionStep}
          onRemoveTransitionStep={onRemoveTransitionStep}
        />
      )}

      {activeTab === 'consultation' && (
        <ConsultationTab student={student} canEdit={canEdit} onEditStudent={onEditStudent} />
      )}

      {activeTab === 'rapport' && (
        <RapportTab student={student} canEdit={canEdit} onSaveNarrativeReport={onSaveNarrativeReport} />
      )}
    </div>
  )
}
