import { useEffect, useRef, useState } from 'react'
import { GOAL_STATUSES, GOAL_STATUS_LABELS, GOAL_STATUS_ICONS, formatHistoryDate } from '../goalStatus'
import { STRATEGY_CATEGORY_LABELS } from '../strategyCategories'
import { useLanguage } from '../i18n/LanguageContext'

function StrategyChip({ strategy, canEdit, onRemove }) {
  const { t } = useLanguage()
  return (
    <span className="strategy-chip">
      {strategy.category && (
        <span className="strategy-category">{t(STRATEGY_CATEGORY_LABELS[strategy.category])}</span>
      )}
      {strategy.label}
      {canEdit && (
        <button className="strategy-chip-remove" onClick={onRemove} title={t('Retirer')}>
          &times;
        </button>
      )}
    </span>
  )
}

function AddStrategyForm({ studentId, goalId, strategiesLibrary, onAddStrategy }) {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addLabel = (rawLabel) => {
    const label = rawLabel.trim()
    if (!label) return
    const match = strategiesLibrary.find((s) => s.label === label)
    onAddStrategy(studentId, goalId, label, match ? match.category : null)
    setValue('')
    setShowSuggestions(false)
  }

  const filtered = strategiesLibrary.filter((s) =>
    s.label.toLowerCase().includes(value.trim().toLowerCase())
  )

  return (
    <div className="strategy-autocomplete" ref={wrapperRef}>
      <form
        className="form-row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault()
          addLabel(value)
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <input
            className="text-input"
            style={{ width: '100%' }}
            placeholder={t('Ajouter une stratégie (suggestion ou texte libre)')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="strategy-suggestions">
              {filtered.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="strategy-suggestion-item"
                  onClick={() => addLabel(s.label)}
                >
                  <span className="strategy-category">{t(STRATEGY_CATEGORY_LABELS[s.category])}</span>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="submit" className="btn">{t('Ajouter')}</button>
      </form>
    </div>
  )
}

function GoalDetails({ studentId, goal, canEdit, strategiesLibrary, onAddStrategy, onRemoveStrategy }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const strategyCount = goal.strategies?.length || 0
  const historyCount = goal.statusHistory?.length || 0

  return (
    <div style={{ marginTop: -2, marginBottom: 8 }}>
      <button className="status-history-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? t('Masquer les détails') : t('Voir les détails')}
        {strategyCount > 0 && t(strategyCount > 1 ? ' · {n} stratégies' : ' · {n} stratégie', { n: strategyCount })}
        {historyCount > 0 && t(' · historique ({n})', { n: historyCount })}
      </button>
      {open && (
        <div className="status-history-list">
          <p className="report-section-title" style={{ margin: '0 0 8px', fontSize: 11 }}>
            {t('Stratégies pédagogiques')}
          </p>
          {strategyCount === 0 && (
            <p style={{ margin: '0 0 8px', color: 'var(--ink-soft)' }}>{t('Aucune stratégie associée.')}</p>
          )}
          {strategyCount > 0 && (
            <div className="strategies-list">
              {goal.strategies.map((s) => (
                <StrategyChip
                  key={s.id}
                  strategy={s}
                  canEdit={canEdit}
                  onRemove={() => onRemoveStrategy(studentId, goal.id, s.id)}
                />
              ))}
            </div>
          )}
          {canEdit && (
            <AddStrategyForm
              studentId={studentId}
              goalId={goal.id}
              strategiesLibrary={strategiesLibrary}
              onAddStrategy={onAddStrategy}
            />
          )}

          {historyCount > 0 && (
            <>
              <p className="report-section-title" style={{ margin: '16px 0 8px', fontSize: 11 }}>
                {t('Historique du niveau de satisfaction')}
              </p>
              {goal.statusHistory.map((h, i) => (
                <div className="status-history-row" key={i}>
                  <span className={`status-badge status-${h.status}`}>
                    <span className="status-icon">{GOAL_STATUS_ICONS[h.status]}</span>
                    {t(GOAL_STATUS_LABELS[h.status])}
                  </span>
                  <span>{formatHistoryDate(h.changed_at)}</span>
                  {h.changed_by && <span>&mdash; {h.changed_by}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function GoalRow({
  studentId,
  goal,
  onToggleGoal,
  onEditGoal,
  onRemoveGoal,
  onChangeStatus,
  onAddStrategy,
  onRemoveStrategy,
  strategiesLibrary,
  canEdit,
}) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(goal.label)

  const save = () => {
    const trimmed = label.trim()
    if (trimmed && trimmed !== goal.label) onEditGoal(studentId, goal.id, trimmed)
    else setLabel(goal.label)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="goal-row">
        <input
          className="text-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setLabel(goal.label); setEditing(false) }
          }}
          autoFocus
        />
        <button className="icon-btn" onClick={save} title={t('Enregistrer')}>&#10003;</button>
        <button className="icon-btn" onClick={() => { setLabel(goal.label); setEditing(false) }} title={t('Annuler')}>&times;</button>
      </div>
    )
  }

  return (
    <div>
      <div className="goal-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <input
            type="checkbox"
            className="goal-check"
            checked={goal.done}
            onChange={() => onToggleGoal(studentId, goal.id)}
          />
          <span className={`goal-label ${goal.done ? 'done' : ''}`}>{goal.label}</span>
        </label>

        {canEdit ? (
          <select
            className={`status-badge status-select status-${goal.status}`}
            value={goal.status}
            onChange={(e) => onChangeStatus(studentId, goal.id, e.target.value)}
            title={t('Niveau de satisfaction')}
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{t(s.label)}</option>
            ))}
          </select>
        ) : (
          <span className={`status-badge status-${goal.status}`}>
            <span className="status-icon">{GOAL_STATUS_ICONS[goal.status]}</span>
            {t(GOAL_STATUS_LABELS[goal.status])}
          </span>
        )}

        {canEdit && (
          <>
            <button className="icon-btn" onClick={() => setEditing(true)} title={t('Modifier')}>&#9998;</button>
            <button
              className="icon-btn icon-btn-danger"
              onClick={() => onRemoveGoal(studentId, goal.id)}
              title={t('Supprimer')}
            >
              &times;
            </button>
          </>
        )}
      </div>
      <GoalDetails
        studentId={studentId}
        goal={goal}
        canEdit={canEdit}
        strategiesLibrary={strategiesLibrary}
        onAddStrategy={onAddStrategy}
        onRemoveStrategy={onRemoveStrategy}
      />
    </div>
  )
}

export function AddGoalRow({ studentId, onAddGoal }) {
  const { t } = useLanguage()
  const [label, setLabel] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!label.trim()) return
    onAddGoal(studentId, label.trim())
    setLabel('')
  }

  return (
    <form className="form-row" style={{ marginTop: 10 }} onSubmit={submit}>
      <input
        className="text-input"
        placeholder={t('+ Ajouter un objectif')}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <button type="submit" className="btn">{t('Ajouter')}</button>
    </form>
  )
}
