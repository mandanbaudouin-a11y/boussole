import { useRef, useState } from 'react'
import { api } from '../api'
import { defaultNextReviewDate } from '../reviewDate'

const STEP = { PICK: 'pick', LOADING: 'loading', REVIEW: 'review' }

function emptyGoalList(goals) {
  return goals && goals.length > 0 ? goals : ['']
}

export default function ImportPeiModal({ open, onClose, onImport }) {
  const fileInputRef = useRef(null)
  const [step, setStep] = useState(STEP.PICK)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [rawText, setRawText] = useState('')
  const [showRawText, setShowRawText] = useState(false)
  const [fileName, setFileName] = useState('')

  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [nextReviewDate, setNextReviewDate] = useState(defaultNextReviewDate())
  const [goals, setGoals] = useState([''])
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const reset = () => {
    setStep(STEP.PICK)
    setError(null)
    setWarning(null)
    setRawText('')
    setShowRawText(false)
    setFileName('')
    setName('')
    setGrade('')
    setNextReviewDate(defaultNextReviewDate())
    setGoals([''])
    setSaving(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const close = () => {
    reset()
    onClose()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setStep(STEP.LOADING)
    try {
      const result = await api.extractImport(file)
      setRawText(result.text || '')
      setWarning(result.warning || null)
      setName(result.guess?.name || '')
      setGrade(result.guess?.grade || '')
      setGoals(emptyGoalList(result.guess?.goals))
      setStep(STEP.REVIEW)
    } catch (err) {
      setError(err.message)
      setStep(STEP.PICK)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const updateGoal = (index, value) => {
    setGoals((prev) => prev.map((g, i) => (i === index ? value : g)))
  }

  const removeGoal = (index) => {
    setGoals((prev) => prev.filter((_, i) => i !== index))
  }

  const addGoal = () => setGoals((prev) => [...prev, ''])

  const confirm = async () => {
    if (!name.trim() || !grade.trim()) {
      setError("Le nom et le niveau de l'élève sont requis avant de confirmer.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onImport({
        name: name.trim(),
        grade: grade.trim(),
        nextReviewDate: nextReviewDate || defaultNextReviewDate(),
        goals: goals.map((g) => g.trim()).filter(Boolean),
      })
      close()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <p className="student-name" style={{ cursor: 'default' }}>Importer un PEI</p>
          <button className="icon-btn" onClick={close} title="Fermer">&times;</button>
        </div>

        {step !== STEP.REVIEW && (
          <p className="report-body" style={{ marginTop: 0 }}>
            Choisissez un fichier PDF ou Word (.docx). Le texte sera extrait automatiquement, mais
            <strong> rien n'est ajouté à la base tant que vous n'avez pas vérifié et confirmé</strong> les
            champs ci-dessous.
          </p>
        )}

        {error && (
          <div className="alert alert-urgent" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        {step === STEP.PICK && (
          <div className="form-row" style={{ marginTop: 4 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="text-input"
            />
          </div>
        )}

        {step === STEP.LOADING && (
          <p className="page-date">Extraction du texte de {fileName}&hellip;</p>
        )}

        {step === STEP.REVIEW && (
          <div>
            {warning && (
              <div className="alert alert-warning" style={{ marginBottom: 14 }}>
                {warning}
              </div>
            )}

            <p className="page-date" style={{ marginBottom: 4 }}>Fichier : {fileName}</p>

            <div className="form-row">
              <input
                className="text-input"
                placeholder="Nom de l'élève"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="text-input"
                placeholder="Niveau (ex. 2e année)"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
              <input
                className="text-input"
                type="date"
                style={{ maxWidth: 180 }}
                title="Prochaine révision du PEI"
                value={nextReviewDate}
                onChange={(e) => setNextReviewDate(e.target.value)}
              />
            </div>

            <p className="report-section-title">Objectifs détectés</p>
            <p className="page-date" style={{ marginTop: -6, marginBottom: 10 }}>
              Vérifiez, corrigez ou supprimez chaque ligne avant de confirmer.
            </p>

            {goals.map((goal, i) => (
              <div className="goal-row" key={i}>
                <input
                  className="text-input"
                  value={goal}
                  onChange={(e) => updateGoal(i, e.target.value)}
                  placeholder="Objectif"
                />
                <button className="icon-btn icon-btn-danger" onClick={() => removeGoal(i)} title="Supprimer">
                  &times;
                </button>
              </div>
            ))}

            <button className="btn" style={{ marginTop: 10 }} onClick={addGoal}>
              + Ajouter une ligne
            </button>

            <div style={{ marginTop: 18 }}>
              <button
                className="back-link"
                style={{ marginBottom: 8 }}
                onClick={() => setShowRawText((v) => !v)}
              >
                {showRawText ? 'Masquer' : 'Afficher'} le texte extrait du document
              </button>
              {showRawText && (
                <pre className="raw-text-preview">{rawText || '(aucun texte extrait)'}</pre>
              )}
            </div>

            <div className="form-row" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={confirm} disabled={saving}>
                {saving ? 'Ajout en cours...' : "Confirmer et ajouter l'élève"}
              </button>
              <button className="btn" onClick={close} disabled={saving}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
