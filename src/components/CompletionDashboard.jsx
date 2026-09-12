import { useEffect, useState } from 'react'
import { api } from '../api'
import { auth } from '../auth'
import { formatHistoryDate } from '../goalStatus'
import { useLanguage } from '../i18n/LanguageContext'
import { getResourceTeacherColor } from '../resourceTeacherColor'

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

// Onglets par enseignant titulaire — seulement pertinent pour un compte
// Enseignant qui collabore avec plusieurs classes (enseignant-ressource) :
// Direction garde volontairement sa vue plate (elle a sa propre navigation
// hiérarchisée par ailleurs, voir ResourceTeacherDrilldown), et un compte
// qui n'a accès qu'à une seule classe n'a rien à filtrer.
function TeacherTabs({ groups, activeTeacherId, onSelect }) {
  const { t } = useLanguage()
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      {groups.map((g) => {
        const active = g.teacherId === activeTeacherId
        const color = getResourceTeacherColor(g.teacherId)
        return (
          <button
            key={g.teacherId}
            type="button"
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderColor: active ? color : undefined,
              background: active ? color : undefined,
              color: active ? '#fff' : undefined,
            }}
            onClick={() => onSelect(g.teacherId)}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: active ? '#fff' : color,
                flexShrink: 0,
              }}
            />
            {g.name}
            <span style={{ opacity: 0.8 }}>
              ({g.count} {t(g.count > 1 ? 'élèves' : 'élève')})
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function CompletionDashboard({ onOpenStudent, students = [] }) {
  const { t } = useLanguage()
  const [completion, setCompletion] = useState(null)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [activeTeacherId, setActiveTeacherId] = useState(null)

  useEffect(() => {
    api.getCompletion().then(setCompletion).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    auth.getProfile().then(setProfile).catch(() => {})
  }, [])

  useEffect(() => {
    if (profile?.role === 'enseignant') {
      auth.getAssignments().then(setAssignments).catch(() => setAssignments([]))
    }
  }, [profile])

  // Les élèves les plus incomplets en premier — met en évidence ceux qui ont
  // le plus besoin d'attention sans avoir à trier manuellement.
  const sorted = completion ? [...completion].sort((a, b) => missingCount(b.sections) - missingCount(a.sections)) : []

  const teacherIdById = new Map(students.map((s) => [s.id, s.teacherId]))

  // Regroupement par enseignant titulaire, réservé au rôle Enseignant
  // (Direction voit toujours la liste plate de toute l'école — sa propre
  // navigation par enseignant-ressource vit ailleurs). N'affiche des
  // onglets que si ça sert vraiment à quelque chose : plus d'une classe
  // accessible.
  const canGroup = profile?.role === 'enseignant' && assignments
  let groups = []
  if (canGroup) {
    const counts = new Map()
    for (const s of sorted) {
      const teacherId = teacherIdById.get(s.id)
      if (!teacherId) continue
      counts.set(teacherId, (counts.get(teacherId) || 0) + 1)
    }
    groups = [...counts.entries()]
      .map(([teacherId, count]) => {
        const owned = assignments.find((a) => a.ownerUserId === teacherId)
        const name = owned ? owned.ownerNomComplet || owned.ownerUsername : (profile.nomComplet || t('Mes élèves'))
        return { teacherId, name, count }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const showTabs = groups.length > 1

  useEffect(() => {
    if (showTabs && (!activeTeacherId || !groups.some((g) => g.teacherId === activeTeacherId))) {
      setActiveTeacherId(groups[0].teacherId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTabs, groups.map((g) => g.teacherId).join(',')])

  const visibleList = showTabs ? sorted.filter((s) => teacherIdById.get(s.id) === activeTeacherId) : sorted

  return (
    <div>
      <p className="page-date">{t("Vue d'ensemble des PEI accessibles")}</p>
      <h1 className="page-title">{t('Tour de contrôle')}</h1>

      {error && <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>}
      {!completion && !error && <p className="page-date">{t('Chargement…')}</p>}
      {completion && completion.length === 0 && (
        <p className="page-date">{t('Aucun élève accessible pour le moment.')}</p>
      )}

      {showTabs && <TeacherTabs groups={groups} activeTeacherId={activeTeacherId} onSelect={setActiveTeacherId} />}

      {completion && completion.length > 0 && (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ cursor: 'default' }}>{t('Élèves')}</p>
            <span className="goal-count">
              {visibleList.length} {t(visibleList.length > 1 ? 'élèves' : 'élève')}
            </span>
          </div>
          {visibleList.map((s) => {
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
