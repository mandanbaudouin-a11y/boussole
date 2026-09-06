import { useEffect, useState } from 'react'
import { api } from '../api'
import { formatHistoryDate } from '../goalStatus'
import { useLanguage } from '../i18n/LanguageContext'

// Une section par bloc du PEI qui peut être vide — voir GET
// /api/students/completion (server/index.js) pour la logique exacte de
// chaque statut. "label" reste court : ces badges s'affichent 5 à la fois
// par élève.
const SECTIONS = [
  { key: 'profil', label: 'Profil' },
  { key: 'objectifs', label: 'Objectifs' },
  { key: 'adaptationsModifications', label: 'Adapt. / Modif.' },
  { key: 'transition', label: 'Transition' },
  { key: 'consultation', label: 'Consultation' },
]

function missingCount(sections) {
  return SECTIONS.filter((s) => sections[s.key] === false).length
}

function SectionBadge({ filled, label }) {
  if (filled === null) {
    return (
      <span className="status-badge" style={{ background: 'var(--paper)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>
        {label} · n/a
      </span>
    )
  }
  return (
    <span className={`status-badge ${filled ? 'status-atteint' : 'status-non_atteint'}`}>
      <span className="status-icon">{filled ? '✓' : '○'}</span>
      {label}
    </span>
  )
}

export default function CompletionDashboard({ onOpenStudent }) {
  const { t } = useLanguage()
  const [completion, setCompletion] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getCompletion().then(setCompletion).catch((e) => setError(e.message))
  }, [])

  // Les élèves les plus incomplets en premier — met en évidence ceux qui ont
  // le plus besoin d'attention sans avoir à trier manuellement.
  const sorted = completion ? [...completion].sort((a, b) => missingCount(b.sections) - missingCount(a.sections)) : []

  return (
    <div>
      <p className="page-date">{t("Vue d'ensemble des PEI accessibles")}</p>
      <h1 className="page-title">{t('Tour de contrôle')}</h1>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}
      {!completion && !error && <p className="page-date">{t('Chargement…')}</p>}
      {completion && completion.length === 0 && (
        <p className="page-date">{t('Aucun élève accessible pour le moment.')}</p>
      )}

      {completion && completion.length > 0 && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ cursor: 'default' }}>{t('Élèves')}</p>
            <span className="goal-count">
              {completion.length} {t(completion.length > 1 ? 'élèves' : 'élève')}
            </span>
          </div>
          {sorted.map((s) => {
            const missing = missingCount(s.sections)
            return (
              <div
                key={s.id}
                className="goal-row"
                style={{ cursor: 'pointer', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }}
                onClick={() => onOpenStudent(s.id)}
              >
                <span className="goal-label" style={{ flex: '1 1 220px' }}>
                  {s.name} &mdash; {s.grade}
                  <span className="page-date" style={{ display: 'block', margin: 0 }}>
                    {missing > 0
                      ? t('{n} section sur 5 à compléter', { n: missing })
                      : t('PEI complet')}
                    {' · '}
                    {s.lastModifiedAt
                      ? t('modifié le {date}', { date: formatHistoryDate(s.lastModifiedAt) })
                      : t('jamais modifié')}
                  </span>
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SECTIONS.map((section) => (
                    <SectionBadge key={section.key} filled={s.sections[section.key]} label={t(section.label)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
