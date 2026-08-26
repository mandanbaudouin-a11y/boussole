import { useState } from 'react'
import { GoalRow, AddGoalRow } from './GoalList'
import { GOAL_STATUS_LABELS, GOAL_STATUS_ICONS } from '../goalStatus'
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

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function StudentHeader({ student, canEdit, onEditStudent, onRemoveStudent }) {
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
            Prochaine révision du PEI
            <input
              className="text-input"
              type="date"
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
            Date de naissance (optionnel)
            <input
              className="text-input"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
          <button className="btn" onClick={() => setEditing(false)}>Annuler</button>
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
          {late ? `Révision en retard` : 'Révision à jour'}
        </span>
        {canEdit && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>Modifier</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm(`Supprimer ${student.name} et tous ses objectifs ?`)) onRemoveStudent(student.id)
              }}
            >
              Supprimer l'élève
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddNoteForm({ studentId, onAddNote }) {
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
        placeholder="+ Ajouter une note"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn">Ajouter</button>
    </form>
  )
}

function EditableTextSection({ title, value, canEdit, studentId, field, onSave }) {
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

  const suggest = async () => {
    setError(null)
    setSuggesting(true)
    try {
      const { suggestion } = await api.suggestFieldText(studentId, field, draft)
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
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button className="btn" onClick={suggest} disabled={suggesting || saving}>
              {suggesting ? 'Suggestion...' : 'Suggérer une formulation avec l’IA'}
            </button>
            <button className="btn" onClick={cancel} disabled={saving}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="report-body">{value && value.trim() ? value : 'Aucune information enregistrée.'}</p>
          {canEdit && (
            <button className="btn" style={{ marginTop: 8 }} onClick={startEditing}>Modifier</button>
          )}
        </div>
      )}
    </div>
  )
}

function ProfilTab({ student, canEdit, onEditStudent }) {
  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <p className="stat-label">Niveau</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{student.grade}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Âge</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{student.age !== null ? `${student.age} ans` : '—'}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Prochaine révision</p>
          <p className="stat-value" style={{ fontSize: 18 }}>{reviewDaysLabel(student.reviewInDays)}</p>
        </div>
      </div>

      {(student.age === null || student.age < 14) && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Plan de transition</p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              className="goal-check"
              checked={student.applicableTransition}
              disabled={!canEdit}
              onChange={(e) => onEditStudent(student.id, { applicableTransition: e.target.checked })}
            />
            Applicable pour cet élève (même si moins de 14 ans)
          </label>
        </div>
      )}

      <EditableTextSection
        title="Forces"
        value={student.forces}
        canEdit={canEdit}
        studentId={student.id}
        field="forces"
        onSave={(text) => onEditStudent(student.id, { forces: text })}
      />
      <EditableTextSection
        title="Besoins"
        value={student.besoins}
        canEdit={canEdit}
        studentId={student.id}
        field="besoins"
        onSave={(text) => onEditStudent(student.id, { besoins: text })}
      />
    </div>
  )
}

function ObjectifsTab({
  student,
  canEdit,
  onToggleGoal,
  onAddGoal,
  onEditGoal,
  onRemoveGoal,
  onChangeGoalStatus,
  onAddStrategy,
  onRemoveStrategy,
  strategiesLibrary,
  onAddNote,
}) {
  const doneCount = student.goals.filter((g) => g.done).length
  const latestRate = student.weeklyRate.length
    ? student.weeklyRate[student.weeklyRate.length - 1].pct
    : 0

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <p className="stat-label">Objectifs actifs</p>
          <p className="stat-value">{student.goals.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Atteints aujourd'hui</p>
          <p className="stat-value">{doneCount}/{student.goals.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Taux, semaine en cours</p>
          <p className="stat-value">{latestRate}%</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Objectifs</p>
        </div>
        {student.goals.map((goal) => (
          <GoalRow
            key={goal.id}
            studentId={student.id}
            goal={goal}
            onToggleGoal={onToggleGoal}
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
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Progrès sur 4 semaines</p>
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
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Notes récentes</p>
        </div>
        {student.notes.length === 0 && <p className="page-date" style={{ margin: 0 }}>Aucune note pour le moment.</p>}
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

function AddAdaptationForm({ studentId, goals, onAdd }) {
  const [subtype, setSubtype] = useState('pedagogique')
  const [goalId, setGoalId] = useState('')
  const [description, setDescription] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!description.trim()) return
    onAdd(studentId, { subtype, description: description.trim(), goalId: goalId || null })
    setDescription('')
    setGoalId('')
  }

  return (
    <form className="form-row" style={{ marginTop: 10, flexWrap: 'wrap' }} onSubmit={submit}>
      <select className="text-input" style={{ maxWidth: 170 }} value={subtype} onChange={(e) => setSubtype(e.target.value)}>
        {ADAPTATION_SUBTYPES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <select className="text-input" style={{ maxWidth: 220 }} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
        <option value="">Générale (non liée à un objectif)</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      <input
        className="text-input"
        style={{ flex: 1, minWidth: 200 }}
        placeholder="Description de l'adaptation"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn">Ajouter</button>
    </form>
  )
}

function AdaptationRow({ adaptation, canEdit, onRemove }) {
  return (
    <div className="goal-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <span className="strategy-category" style={{ marginRight: 8 }}>
          {ADAPTATION_SUBTYPE_LABELS[adaptation.subtype] || adaptation.subtype}
        </span>
        <span className="goal-label">{adaptation.description}</span>
        {adaptation.goalLabel && (
          <p className="page-date" style={{ margin: '4px 0 0' }}>Liée à : {adaptation.goalLabel}</p>
        )}
      </div>
      {canEdit && (
        <button className="icon-btn icon-btn-danger" onClick={onRemove} title="Retirer">&times;</button>
      )}
    </div>
  )
}

function AddModificationForm({ studentId, onAdd }) {
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
        {MODIFICATION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <input
        className="text-input"
        style={{ maxWidth: 160 }}
        placeholder="Matière concernée"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <input
        className="text-input"
        style={{ flex: 1, minWidth: 200 }}
        placeholder="Description du changement d'attente"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn">Ajouter</button>
    </form>
  )
}

function ModificationRow({ modification, canEdit, onRemove }) {
  return (
    <div className="goal-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <span className="strategy-category" style={{ marginRight: 8 }}>
          {MODIFICATION_TYPE_LABELS[modification.type] || modification.type}
        </span>
        <span className="goal-label">{modification.description}</span>
        <p className="page-date" style={{ margin: '4px 0 0' }}>Matière : {modification.subject}</p>
      </div>
      {canEdit && (
        <button className="icon-btn icon-btn-danger" onClick={onRemove} title="Retirer">&times;</button>
      )}
    </div>
  )
}

function AdaptationsModificationsTab({
  student,
  canEdit,
  onAddAdaptation,
  onRemoveAdaptation,
  onAddModification,
  onRemoveModification,
}) {
  return (
    <div>
      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Adaptations</p>
        </div>
        {student.adaptations.length === 0 && (
          <p className="page-date" style={{ margin: 0 }}>Aucune adaptation enregistrée.</p>
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
          <AddAdaptationForm studentId={student.id} goals={student.goals} onAdd={onAddAdaptation} />
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Modifications</p>
        </div>
        {student.modifications.length === 0 && (
          <p className="page-date" style={{ margin: 0 }}>Aucune modification enregistrée.</p>
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
          placeholder="Objectif de transition (ex. obtenir un emploi à temps partiel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <input
          className="text-input"
          style={{ maxWidth: 200 }}
          placeholder="Responsable"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        />
        <input
          className="text-input"
          type="date"
          style={{ maxWidth: 180 }}
          title="Délai prévu"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="Ressources communautaires"
          value={communityResources}
          onChange={(e) => setCommunityResources(e.target.value)}
        />
        <button type="submit" className="btn">Ajouter l'objectif</button>
      </div>
    </form>
  )
}

function AddTransitionStepForm({ studentId, goalId, onAdd }) {
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
        placeholder="+ Ajouter une étape"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn">Ajouter</button>
    </form>
  )
}

function TransitionGoalCard({ studentId, goal, canEdit, onRemoveGoal, onAddStep, onRemoveStep }) {
  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>{goal.description}</p>
        {canEdit && (
          <button className="icon-btn icon-btn-danger" onClick={() => onRemoveGoal(studentId, goal.id)} title="Supprimer">
            &times;
          </button>
        )}
      </div>

      {(goal.responsible || goal.targetDate) && (
        <p className="page-date" style={{ margin: '0 0 4px' }}>
          {goal.responsible && `Responsable : ${goal.responsible}`}
          {goal.responsible && goal.targetDate && '  ·  '}
          {goal.targetDate && `Délai prévu : ${formatDate(goal.targetDate)}`}
        </p>
      )}
      {goal.communityResources && (
        <p className="page-date" style={{ margin: '0 0 12px' }}>Ressources communautaires : {goal.communityResources}</p>
      )}

      <p className="report-section-title" style={{ margin: '8px 0' }}>Étapes</p>
      {goal.steps.length === 0 && <p className="page-date" style={{ margin: 0 }}>Aucune étape ajoutée.</p>}
      {goal.steps.map((s) => (
        <div className="goal-row" key={s.id}>
          <span className="goal-label">{s.description}</span>
          {canEdit && (
            <button className="icon-btn icon-btn-danger" onClick={() => onRemoveStep(studentId, goal.id, s.id)} title="Retirer">
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
  return (
    <div>
      {student.transitionGoals.length === 0 && (
        <div className="card">
          <p className="page-date" style={{ margin: 0 }}>Aucun objectif de transition enregistré.</p>
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
            <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Ajouter un objectif de transition</p>
          </div>
          <AddTransitionGoalForm studentId={student.id} onAdd={onAddTransitionGoal} />
        </div>
      )}
    </div>
  )
}

function ConsultationTab({ student, canEdit, onEditStudent }) {
  const [editing, setEditing] = useState(false)
  const [consultationDate, setConsultationDate] = useState('')
  const [consultationMethod, setConsultationMethod] = useState('')
  const [copyDeliveryDate, setCopyDeliveryDate] = useState('')
  const [acknowledgmentStatus, setAcknowledgmentStatus] = useState('')

  const startEditing = () => {
    setConsultationDate(student.consultationDate || '')
    setConsultationMethod(student.consultationMethod || '')
    setCopyDeliveryDate(student.copyDeliveryDate || '')
    setAcknowledgmentStatus(student.acknowledgmentStatus || '')
    setEditing(true)
  }

  const save = () => {
    onEditStudent(student.id, { consultationDate, consultationMethod, copyDeliveryDate, acknowledgmentStatus })
    setEditing(false)
  }

  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }

  if (editing) {
    return (
      <div className="card">
        <div className="card-header">
          <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Consultation et remise</p>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap' }}>
          <label style={fieldStyle}>
            Date de consultation
            <input
              className="text-input"
              type="date"
              value={consultationDate}
              onChange={(e) => setConsultationDate(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            Méthode de consultation
            <input
              className="text-input"
              list="consultation-methods"
              placeholder="ex. Réunion"
              value={consultationMethod}
              onChange={(e) => setConsultationMethod(e.target.value)}
            />
            <datalist id="consultation-methods">
              {CONSULTATION_METHOD_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          <label style={fieldStyle}>
            Date de remise de copie
            <input
              className="text-input"
              type="date"
              value={copyDeliveryDate}
              onChange={(e) => setCopyDeliveryDate(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            Accusé de réception
            <select
              className="text-input"
              value={acknowledgmentStatus}
              onChange={(e) => setAcknowledgmentStatus(e.target.value)}
            >
              <option value="">—</option>
              {ACKNOWLEDGMENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        {student.age !== null && student.age >= 16 && (
          <p className="page-date" style={{ marginTop: 14 }}>
            L'élève a 16 ans ou plus : une copie du PEI doit aussi lui être remise directement.
          </p>
        )}

        <div className="form-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
          <button className="btn" onClick={() => setEditing(false)}>Annuler</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <p className="student-name" style={{ fontSize: 15, cursor: 'default' }}>Consultation et remise</p>
        {student.copyDeliveryOverdue && <span className="status-badge status-non_atteint">En retard</span>}
      </div>

      <div className="stat-grid" style={{ marginBottom: 4 }}>
        <div className="stat-card">
          <p className="stat-label">Consultation parentale</p>
          <p className="stat-value" style={{ fontSize: 15 }}>
            {formatDate(student.consultationDate) || 'Non renseignée'}
          </p>
          {student.consultationMethod && <p className="page-date" style={{ margin: '2px 0 0' }}>{student.consultationMethod}</p>}
        </div>
        <div className="stat-card">
          <p className="stat-label">Remise de copie</p>
          <p className="stat-value" style={{ fontSize: 15 }}>
            {formatDate(student.copyDeliveryDate) || 'Non renseignée'}
          </p>
          {student.acknowledgmentStatus && (
            <p className="page-date" style={{ margin: '2px 0 0' }}>
              Accusé : {ACKNOWLEDGMENT_STATUS_LABELS[student.acknowledgmentStatus]}
            </p>
          )}
        </div>
      </div>

      {student.age !== null && student.age >= 16 && (
        <p className="page-date" style={{ margin: '0 0 12px' }}>
          L'élève a 16 ans ou plus : une copie du PEI doit aussi lui être remise directement.
        </p>
      )}

      {canEdit && <button className="btn" onClick={startEditing}>Modifier</button>}
    </div>
  )
}

function computedSummaryText(student) {
  const doneCount = student.goals.filter((g) => g.done).length
  const hasWeeklyRate = student.weeklyRate.length > 0
  const firstName = student.name.split(' ')[0]

  if (!hasWeeklyRate) {
    return `Aucun historique hebdomadaire n'est encore disponible pour ${firstName}. Aujourd'hui, ${doneCount} objectif${doneCount > 1 ? 's' : ''} sur ${student.goals.length} ${doneCount > 1 ? 'ont' : 'a'} été coché${doneCount > 1 ? 's' : ''} comme atteint${doneCount > 1 ? 's' : ''}.`
  }

  const avgRate = Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
  const firstRate = student.weeklyRate[0].pct
  const lastRate = student.weeklyRate[student.weeklyRate.length - 1].pct

  return (
    `Sur les ${student.weeklyRate.length} dernières semaines, ${firstName} a atteint un taux moyen de ` +
    `réussite de ${avgRate}% sur l'ensemble des objectifs actifs de son PEI. Aujourd'hui, ${doneCount} objectif${doneCount > 1 ? 's' : ''} sur ${student.goals.length} ${doneCount > 1 ? 'ont' : 'a'} été coché${doneCount > 1 ? 's' : ''} comme atteint${doneCount > 1 ? 's' : ''}. La tendance ` +
    `hebdomadaire est ${lastRate >= firstRate ? 'à la hausse' : 'stable'}, passant ` +
    `de ${firstRate}% en semaine 1 à ${lastRate}% en semaine ${student.weeklyRate.length}.`
  )
}

function ReportSummary({ student, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const hasNarrative = !!(student.narrativeReport && student.narrativeReport.trim())
  const displayedText = hasNarrative ? student.narrativeReport : computedSummaryText(student)

  const startEditing = () => {
    setError(null)
    setDraft(student.narrativeReport || '')
    setEditing(true)
  }

  const generate = async () => {
    if (editing && !confirm('Régénérer un nouveau brouillon avec l’IA ? Le texte actuel dans la zone de modification sera remplacé.')) {
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const { draft: generated } = await api.generateAiReport(student.id)
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
      <p className="report-section-title">Résumé</p>

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
              {saving ? 'Enregistrement...' : 'Enregistrer ce résumé'}
            </button>
            <button className="btn" onClick={generate} disabled={generating || saving}>
              {generating ? 'Génération...' : 'Régénérer avec l’IA'}
            </button>
            <button className="btn" onClick={cancel} disabled={saving}>
              Annuler
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
                  <button className="btn" onClick={startEditing}>Modifier</button>
                  <button className="btn" onClick={generate} disabled={generating}>
                    {generating ? 'Génération...' : 'Régénérer avec l’IA'}
                  </button>
                  <button className="btn" onClick={clearNarrative} disabled={saving}>
                    Revenir au résumé automatique
                  </button>
                </>
              ) : (
                <button className="btn" onClick={generate} disabled={generating}>
                  {generating ? 'Génération en cours...' : 'Générer un résumé avec l’IA'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function RapportTab({ student, canEdit, onSaveNarrativeReport }) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  const handleExportPdf = async () => {
    setPdfError(null)
    setExportingPdf(true)
    try {
      const { blob, filename } = await api.downloadStudentReportPdf(student.id)
      triggerBlobDownload(blob, filename)
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setExportingPdf(false)
    }
  }

  const doneCount = student.goals.filter((g) => g.done).length
  const hasWeeklyRate = student.weeklyRate.length > 0
  const avgRate = hasWeeklyRate
    ? Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    : 0
  const today = new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="form-row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={handleExportPdf} disabled={exportingPdf}>
          {exportingPdf ? 'Export en cours...' : 'Exporter en PDF'}
        </button>
      </div>

      {pdfError && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{pdfError}</div>}

      <div className="report-sheet">
        <div className="report-header">
          <div className="brand-row" style={{ marginBottom: 0 }}>
            <img src="/logo-boussole-icon.svg" alt="" className="brand-icon" style={{ width: 30, height: 30 }} />
            <div>
              <p className="brand" style={{ fontSize: 18, lineHeight: 1.1 }}>Boussole</p>
              <p className="report-meta" style={{ margin: 0 }}>Plan d'enseignement individualisé</p>
            </div>
          </div>
          <p className="report-header-date">Généré le {today}</p>
        </div>

        <h2 className="report-title">{student.name} &mdash; {student.grade}</h2>

        <div className="stat-grid" style={{ marginBottom: 4 }}>
          <div className="stat-card">
            <p className="stat-label">Généré le</p>
            <p className="stat-value" style={{ fontSize: 16 }}>{today}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">
              {hasWeeklyRate ? `Taux moyen, ${student.weeklyRate.length} semaines` : 'Taux moyen'}
            </p>
            <p className="stat-value">{avgRate}%</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Objectifs actifs</p>
            <p className="stat-value">{student.goals.length}</p>
          </div>
        </div>

        <ReportSummary student={student} canEdit={canEdit} onSave={onSaveNarrativeReport} />

        <p className="report-section-title">Objectifs suivis</p>
        {student.goals.map((goal) => (
          <div className="report-goal-block" key={goal.id}>
            <div className="report-goal-line">
              <span>{goal.label}</span>
              <span className={`status-badge status-${goal.status}`}>
                <span className="status-icon">{GOAL_STATUS_ICONS[goal.status]}</span>
                {GOAL_STATUS_LABELS[goal.status]}
              </span>
            </div>
            {goal.strategies && goal.strategies.length > 0 && (
              <div className="report-goal-strategies">
                {goal.strategies.map((s) => (
                  <span className="strategy-chip" key={s.id}>
                    {s.category && (
                      <span className="strategy-category">{STRATEGY_CATEGORY_LABELS[s.category]}</span>
                    )}
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        <p className="report-section-title">Notes de l'enseignant</p>
        {student.notes.map((note, i) => (
          <div className="report-goal-line" key={i}>
            <span className="week-label" style={{ width: 60 }}>{note.date}</span>
            <span style={{ flex: 1, marginLeft: 12 }}>{note.text}</span>
          </div>
        ))}

        <div className={`alert ${student.reviewInDays <= 7 ? 'alert-urgent' : 'alert-warning'}`} style={{ marginTop: 24 }}>
          <span>
            Prochaine révision du PEI {reviewDaysLabel(student.reviewInDays)} &mdash; à inscrire à l'ordre du jour de la rencontre parents-école.
          </span>
        </div>
      </div>
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
  onToggleGoal,
  onAddGoal,
  onEditGoal,
  onRemoveGoal,
  onChangeGoalStatus,
  onAddStrategy,
  onRemoveStrategy,
  strategiesLibrary,
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
          &larr; Retour au tableau de bord
        </button>
        <div className="student-nav-arrows">
          {positionLabel && <span className="student-nav-position">{positionLabel}</span>}
          <button className="icon-btn" onClick={onPrev} disabled={!onPrev} title="Élève précédent">&#8592;</button>
          <button className="icon-btn" onClick={onNext} disabled={!onNext} title="Élève suivant">&#8594;</button>
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
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profil' && (
        <ProfilTab student={student} canEdit={canEdit} onEditStudent={onEditStudent} />
      )}

      {activeTab === 'objectifs' && (
        <ObjectifsTab
          student={student}
          canEdit={canEdit}
          onToggleGoal={onToggleGoal}
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
