import { useState } from 'react'
import ImportPeiModal from './ImportPeiModal'
import BackupPanel from './BackupPanel'
import { api } from '../api'
import { triggerBlobDownload } from '../downloadBlob'
import { defaultNextReviewDate, reviewDaysLabel } from '../reviewDate'
import { initials, avatarColor } from '../avatar'
import { useLanguage } from '../i18n/LanguageContext'

function NewStudentForm({ onAddStudent, onDone }) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [nextReviewDate, setNextReviewDate] = useState(defaultNextReviewDate())

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || !grade.trim()) return
    onAddStudent({ name: name.trim(), grade: grade.trim(), nextReviewDate: nextReviewDate || defaultNextReviewDate() })
    setName('')
    setGrade('')
    setNextReviewDate(defaultNextReviewDate())
    onDone()
  }

  return (
    <form className="card new-student-form" style={{ flex: '1 1 100%' }} onSubmit={submit}>
      <div className="card-header">
        <p className="student-name" style={{ cursor: 'default' }}>{t('Nouvel élève')}</p>
      </div>
      <div className="form-row">
        <input
          className="text-input"
          placeholder={t("Nom de l'élève")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className="text-input"
          placeholder={t('Niveau (ex. 2e année)')}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <input
          className="text-input"
          type="date"
          style={{ maxWidth: 160 }}
          title={t('Prochaine révision du PEI')}
          value={nextReviewDate}
          onChange={(e) => setNextReviewDate(e.target.value)}
        />
      </div>
      <div className="form-row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary">{t('Ajouter')}</button>
        <button type="button" className="btn" onClick={onDone}>{t('Annuler')}</button>
      </div>
    </form>
  )
}

function StudentCard({ student, canEdit, onOpenStudent, onRemoveStudent }) {
  const { t } = useLanguage()
  const achievedCount = student.goals.filter((g) => g.status === 'atteint' || g.status === 'depasse').length
  const goalCount = student.goals.length
  const late = student.reviewInDays < 0

  return (
    <div className="student-card" onClick={() => onOpenStudent(student.id)}>
      <div className="student-card-top">
        <div className="avatar" style={{ width: 44, height: 44, fontSize: 15.5, background: avatarColor(student.id) }}>
          {initials(student.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="student-card-name">{student.name}</p>
          <p className="student-card-grade">{student.grade}</p>
        </div>
        {canEdit && (
          <button
            className="icon-btn icon-btn-danger"
            title={t("Supprimer l'élève")}
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(t('Supprimer {name} et tous ses objectifs ?', { name: student.name }))) onRemoveStudent(student.id)
            }}
          >
            &times;
          </button>
        )}
      </div>

      {goalCount > 0 && (
        <div className="status-bars">
          {student.goals.map((g) => (
            <span key={g.id} className={`status-bar-${g.status}`} />
          ))}
        </div>
      )}

      <div className="student-card-footer">
        <span>
          {goalCount} {t(goalCount > 1 ? 'objectifs' : 'objectif')}
          {goalCount > 0 && ` · ${achievedCount} ${t(achievedCount > 1 ? 'atteints' : 'atteint')}`}
        </span>
        <span className={`review-pill ${late ? 'late' : 'ok'}`}>
          {late ? reviewDaysLabel(student.reviewInDays, t) : t('À jour')}
        </span>
      </div>
    </div>
  )
}

export default function Dashboard({
  students,
  role,
  onOpenStudent,
  onAddStudent,
  onRemoveStudent,
  onImportStudent,
  onDataRestored,
}) {
  const { t, lang } = useLanguage()
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportingClassPdf, setExportingClassPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const canEdit = role === 'enseignant'

  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const nextReview = [...students].sort((a, b) => a.reviewInDays - b.reviewInDays)[0]
  const totalGoals = students.reduce((sum, s) => sum + s.goals.length, 0)
  const goalsInProgress = students.reduce((sum, s) => sum + s.goals.filter((g) => g.status === 'en_progres').length, 0)
  const upcomingReviews = students.filter((s) => s.reviewInDays >= 0 && s.reviewInDays <= 14).length

  const handleExportClassPdf = async () => {
    setPdfError(null)
    setExportingClassPdf(true)
    try {
      const { blob, filename } = await api.downloadCombinedReportPdf(lang)
      triggerBlobDownload(blob, filename)
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setExportingClassPdf(false)
    }
  }

  return (
    <div>
      <p className="page-date">{today}</p>
      <h1 className="page-title">{t('Suivi du jour')}</h1>

      {students.length > 0 && (
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">{t('Élèves suivis')}</p>
            <p className="stat-value">{students.length}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{t('Objectifs actifs')}</p>
            <p className="stat-value">{totalGoals}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>{goalsInProgress} {t('en progrès')}</span></p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{t('Révisions à venir')}</p>
            <p className="stat-value">{upcomingReviews}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>{t("d'ici 2 semaines")}</span></p>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="form-row" style={{ marginBottom: 20 }}>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ {t('Nouvel élève')}</button>
          <button className="btn" onClick={() => setImportOpen(true)}>
            {t('Importer un PEI')}
          </button>
        </div>
      )}

      {canEdit && addOpen && (
        <div style={{ marginBottom: 20 }}>
          <NewStudentForm onAddStudent={onAddStudent} onDone={() => setAddOpen(false)} />
        </div>
      )}

      {students.length > 0 && (
        <div className="form-row" style={{ marginBottom: 20 }}>
          <button className="btn" onClick={handleExportClassPdf} disabled={exportingClassPdf}>
            {exportingClassPdf ? t('Export en cours...') : t('Exporter tous les rapports en PDF')}
          </button>
        </div>
      )}

      {pdfError && <div className="alert alert-urgent" style={{ marginBottom: 20 }}>{pdfError}</div>}

      {canEdit && (
        <ImportPeiModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={onImportStudent}
        />
      )}

      {canEdit && <BackupPanel onRestored={onDataRestored} />}

      {students.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✦</div>
          <p className="empty-state-title">{t('Aucun élève pour le moment')}</p>
          <p className="empty-state-body">
            {t("Créez une première fiche pour commencer le suivi d'un PEI, ou importez un document existant.")}
          </p>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ {t('Nouvel élève')}</button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 28 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('Mes élèves')}</h2>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div className="student-grid">
            {students.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                canEdit={canEdit}
                onOpenStudent={onOpenStudent}
                onRemoveStudent={onRemoveStudent}
              />
            ))}
            {canEdit && (
              <button type="button" className="dashed-card" onClick={() => setAddOpen(true)}>
                <span className="dashed-card-icon">✦</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t('Ajouter un élève')}</span>
                <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: 190 }}>
                  {t("Créez un PEI à partir d'une page vierge ou d'un import.")}
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {nextReview && (
        <div className={`alert ${nextReview.reviewInDays <= 7 ? 'alert-urgent' : 'alert-warning'}`} style={{ marginTop: 20 }}>
          {t('Révision du PEI de {name} {days}', { name: nextReview.name, days: reviewDaysLabel(nextReview.reviewInDays, t) })}
        </div>
      )}
    </div>
  )
}
