import { reviewDaysLabel } from '../reviewDate'
import { useLanguage } from '../i18n/LanguageContext'

const TIERS = [
  { key: 'urgent', title: 'Urgent — 7 jours ou moins', statusClass: 'status-non_atteint', test: (d) => d <= 7 },
  { key: 'soon', title: 'Bientôt — 8 à 14 jours', statusClass: 'status-en_progres', test: (d) => d > 7 && d <= 14 },
  { key: 'coming', title: 'À venir — 15 à 30 jours', statusClass: 'status-depasse', test: (d) => d > 14 && d <= 30 },
  { key: 'later', title: 'Plus tard', statusClass: 'status-atteint', test: (d) => d > 30 },
]

function formatDate(dateStr, lang) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function UpcomingReviews({ students, onOpenStudent }) {
  const { t, lang } = useLanguage()
  const sorted = [...students].sort((a, b) => a.reviewInDays - b.reviewInDays)

  return (
    <div>
      <p className="page-date">{t('Suivi des échéances')}</p>
      <h1 className="page-title">{t('Révisions à venir')}</h1>

      {students.length === 0 && <p className="page-date">{t('Aucun élève pour le moment.')}</p>}

      {TIERS.map((tier) => {
        const rows = sorted.filter((s) => tier.test(s.reviewInDays))
        if (rows.length === 0) return null
        return (
          <div className="card" key={tier.key}>
            <div className="card-header">
              <p className="student-name" style={{ cursor: 'default' }}>{t(tier.title)}</p>
              <span className="goal-count">{rows.length} {t(rows.length > 1 ? 'élèves' : 'élève')}</span>
            </div>
            {rows.map((s) => (
              <div className="goal-row" key={s.id} style={{ cursor: 'pointer' }} onClick={() => onOpenStudent(s.id)}>
                <span className="goal-label">
                  {s.name} &mdash; {s.grade}
                  <span className="page-date" style={{ display: 'block', margin: 0 }}>
                    {t('Révision prévue le {date}', { date: formatDate(s.nextReviewDate, lang) })}
                  </span>
                </span>
                <span className={`status-badge ${tier.statusClass}`}>{reviewDaysLabel(s.reviewInDays, t)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
