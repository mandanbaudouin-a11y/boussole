import { reviewDaysLabel } from '../reviewDate'

const TIERS = [
  { key: 'urgent', title: 'Urgent — 7 jours ou moins', statusClass: 'status-non_atteint', test: (d) => d <= 7 },
  { key: 'soon', title: 'Bientôt — 8 à 14 jours', statusClass: 'status-en_progres', test: (d) => d > 7 && d <= 14 },
  { key: 'coming', title: 'À venir — 15 à 30 jours', statusClass: 'status-depasse', test: (d) => d > 14 && d <= 30 },
  { key: 'later', title: 'Plus tard', statusClass: 'status-atteint', test: (d) => d > 30 },
]

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function UpcomingReviews({ students, onOpenStudent }) {
  const sorted = [...students].sort((a, b) => a.reviewInDays - b.reviewInDays)

  return (
    <div>
      <p className="page-date">Suivi des échéances</p>
      <h1 className="page-title">Révisions à venir</h1>

      {students.length === 0 && <p className="page-date">Aucun élève pour le moment.</p>}

      {TIERS.map((tier) => {
        const rows = sorted.filter((s) => tier.test(s.reviewInDays))
        if (rows.length === 0) return null
        return (
          <div className="card" key={tier.key}>
            <div className="card-header">
              <p className="student-name" style={{ cursor: 'default' }}>{tier.title}</p>
              <span className="goal-count">{rows.length} élève{rows.length > 1 ? 's' : ''}</span>
            </div>
            {rows.map((s) => (
              <div className="goal-row" key={s.id} style={{ cursor: 'pointer' }} onClick={() => onOpenStudent(s.id)}>
                <span className="goal-label">
                  {s.name} &mdash; {s.grade}
                  <span className="page-date" style={{ display: 'block', margin: 0 }}>
                    Révision prévue le {formatDate(s.nextReviewDate)}
                  </span>
                </span>
                <span className={`status-badge ${tier.statusClass}`}>{reviewDaysLabel(s.reviewInDays)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
