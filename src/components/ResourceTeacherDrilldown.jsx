import { useEffect, useState } from 'react'
import { auth } from '../auth'
import { useLanguage } from '../i18n/LanguageContext'
import { getResourceTeacherColor } from '../resourceTeacherColor'
import { resourceDrilldownPath } from '../router'

function Breadcrumb({ resourceId, resourceName, ownerName, navigate }) {
  const { t } = useLanguage()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 13 }}>
      <button
        type="button"
        className="back-link"
        style={{ marginBottom: 0 }}
        onClick={() => navigate(resourceDrilldownPath())}
      >
        {t('Enseignants-ressource')}
      </button>
      {resourceName && (
        <>
          <span className="page-date" style={{ margin: 0 }}>/</span>
          {ownerName ? (
            <button
              type="button"
              className="back-link"
              style={{ marginBottom: 0, color: getResourceTeacherColor(resourceId), fontWeight: 600 }}
              onClick={() => navigate(resourceDrilldownPath(resourceId))}
            >
              {resourceName}
            </button>
          ) : (
            <span style={{ color: getResourceTeacherColor(resourceId), fontWeight: 600 }}>{resourceName}</span>
          )}
        </>
      )}
      {ownerName && (
        <>
          <span className="page-date" style={{ margin: 0 }}>/</span>
          <span style={{ fontWeight: 600 }}>{ownerName}</span>
        </>
      )}
    </div>
  )
}

export default function ResourceTeacherDrilldown({ resourceId, ownerId, students, onOpenStudent, navigate }) {
  const { t } = useLanguage()
  const [assignments, setAssignments] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    auth.getAssignments().then(setAssignments).catch((e) => setError(e.message))
  }, [])

  if (error) {
    return <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{error}</div>
  }
  if (!assignments) {
    return <p className="page-date">{t('Chargement…')}</p>
  }

  // ---------- Niveau 1 : liste des enseignants-ressource ----------
  if (!resourceId) {
    const byResource = new Map()
    for (const a of assignments) {
      if (!byResource.has(a.resourceUserId)) {
        byResource.set(a.resourceUserId, { name: a.resourceNomComplet || a.resourceUsername, count: 0 })
      }
      byResource.get(a.resourceUserId).count += 1
    }
    const resources = [...byResource.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))

    return (
      <div>
        <p className="page-date">{t("Vue d'ensemble des PEI accessibles")}</p>
        <h1 className="page-title">{t('Par enseignant-ressource')}</h1>

        {resources.length === 0 && (
          <p className="page-date">{t('Aucun enseignant-ressource assigné pour le moment.')}</p>
        )}

        {resources.length > 0 && (
          <div className="card">
            <div className="card-header">
              <p className="student-name" style={{ cursor: 'default' }}>{t('Enseignants-ressource')}</p>
            </div>
            {resources.map(([id, r]) => (
              <div
                key={id}
                className="goal-row"
                style={{ cursor: 'pointer', alignItems: 'center', gap: 10 }}
                onClick={() => navigate(resourceDrilldownPath(id))}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: getResourceTeacherColor(id),
                    flexShrink: 0,
                  }}
                />
                <span className="goal-label" style={{ flex: 1 }}>{r.name}</span>
                <span className="page-date" style={{ margin: 0 }}>
                  {r.count} {t(r.count > 1 ? 'classes suivies' : 'classe suivie')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const resourceAssignments = assignments.filter((a) => a.resourceUserId === resourceId)
  const resourceName = resourceAssignments[0]
    ? resourceAssignments[0].resourceNomComplet || resourceAssignments[0].resourceUsername
    : resourceId

  // Assignation retirée entre-temps (lien périmé) : retomber sur le niveau 1
  // plutôt qu'une page blanche.
  if (resourceAssignments.length === 0) {
    return (
      <div>
        <Breadcrumb navigate={navigate} />
        <p className="page-date" style={{ marginTop: 12 }}>
          {t("Cet enseignant-ressource n'a plus d'assignation active.")}
        </p>
      </div>
    )
  }

  // ---------- Niveau 2 : classes assignées à cet enseignant-ressource ----------
  if (!ownerId) {
    const owners = resourceAssignments
      .map((a) => ({
        id: a.ownerUserId,
        name: a.ownerNomComplet || a.ownerUsername,
        studentCount: students.filter((s) => s.teacherId === a.ownerUserId).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return (
      <div>
        <Breadcrumb resourceId={resourceId} resourceName={resourceName} navigate={navigate} />
        <h1 className="page-title">{resourceName}</h1>

        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ cursor: 'default' }}>{t('Classes suivies')}</p>
          </div>
          {owners.map((o) => (
            <div
              key={o.id}
              className="goal-row"
              style={{ cursor: 'pointer', alignItems: 'center' }}
              onClick={() => navigate(resourceDrilldownPath(resourceId, o.id))}
            >
              <span className="goal-label" style={{ flex: 1 }}>{o.name}</span>
              <span className="page-date" style={{ margin: 0 }}>
                {o.studentCount} {t(o.studentCount > 1 ? 'élèves' : 'élève')}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---------- Niveau 3 : élèves de cette classe ----------
  const ownerAssignment = resourceAssignments.find((a) => a.ownerUserId === ownerId)
  const ownerName = ownerAssignment ? ownerAssignment.ownerNomComplet || ownerAssignment.ownerUsername : ownerId

  if (!ownerAssignment) {
    return (
      <div>
        <Breadcrumb resourceId={resourceId} resourceName={resourceName} navigate={navigate} />
        <p className="page-date" style={{ marginTop: 12 }}>
          {t("Cette classe n'est plus assignée à cet enseignant-ressource.")}
        </p>
      </div>
    )
  }

  const classStudents = students
    .filter((s) => s.teacherId === ownerId)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <Breadcrumb resourceId={resourceId} resourceName={resourceName} ownerName={ownerName} navigate={navigate} />
      <h1 className="page-title">{ownerName}</h1>

      {classStudents.length === 0 ? (
        <p className="page-date">{t('Aucun élève pour le moment.')}</p>
      ) : (
        <div className="card">
          <div className="card-header">
            <p className="student-name" style={{ cursor: 'default' }}>{t('Élèves')}</p>
          </div>
          {classStudents.map((s) => (
            <div
              key={s.id}
              className="goal-row"
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenStudent(s.id)}
            >
              <span className="goal-label">{s.name} &mdash; {s.grade}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
