import { useRef, useState } from 'react'
import { api } from '../api'

export default function BackupPanel({ onRestored }) {
  const fileInputRef = useRef(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(null)

  const handleExport = async () => {
    setExportError(null)
    setExporting(true)
    try {
      const { blob, filename } = await api.downloadBackup()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const openRestoreDialog = () => {
    setRestoreOpen(true)
    setPendingFile(null)
    setConfirmChecked(false)
    setRestoreError(null)
  }

  const closeRestoreDialog = () => {
    setRestoreOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = (e) => {
    setPendingFile(e.target.files?.[0] || null)
    setConfirmChecked(false)
    setRestoreError(null)
  }

  const confirmRestore = async () => {
    if (!pendingFile || !confirmChecked) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await api.restoreBackup(pendingFile)
      closeRestoreDialog()
      onRestored()
    } catch (err) {
      setRestoreError(err.message)
      setRestoring(false)
    }
  }

  return (
    <div className="card backup-panel">
      <div className="card-header">
        <p className="student-name" style={{ cursor: 'default' }}>Sauvegarde des données</p>
      </div>

      <p className="backup-hint">
        Toutes les données sont stockées uniquement sur cet ordinateur &mdash; pensez à exporter une
        sauvegarde régulièrement.
      </p>

      {exportError && <div className="alert alert-urgent" style={{ marginBottom: 12 }}>{exportError}</div>}

      <div className="form-row">
        <button className="btn" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Export en cours...' : 'Exporter une sauvegarde'}
        </button>
        <button className="btn" onClick={openRestoreDialog}>
          Restaurer une sauvegarde
        </button>
      </div>

      {restoreOpen && (
        <div className="modal-backdrop" onClick={closeRestoreDialog}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <p className="student-name" style={{ cursor: 'default' }}>Restaurer une sauvegarde</p>
              <button className="icon-btn" onClick={closeRestoreDialog} title="Fermer">&times;</button>
            </div>

            <div className="alert alert-urgent" style={{ marginBottom: 16 }}>
              <span>
                Cette action <strong>remplace définitivement</strong> tous les élèves, objectifs, taux
                hebdomadaires et notes actuels par le contenu du fichier choisi. Elle est irréversible, sauf
                si vous disposez vous-même d'une sauvegarde de l'état actuel. Les comptes (enseignant, EA) ne
                sont pas affectés.
              </span>
            </div>

            {restoreError && (
              <div className="alert alert-urgent" style={{ marginBottom: 16 }}>{restoreError}</div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="text-input"
              style={{ width: '100%', marginBottom: 16 }}
            />

            {pendingFile && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  className="goal-check"
                  style={{ marginTop: 2 }}
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                />
                <span>
                  Je comprends que la restauration de <strong>{pendingFile.name}</strong> remplacera
                  définitivement toutes les données actuelles des élèves.
                </span>
              </label>
            )}

            <div className="form-row">
              <button
                className="btn btn-danger"
                onClick={confirmRestore}
                disabled={!pendingFile || !confirmChecked || restoring}
              >
                {restoring ? 'Restauration en cours...' : 'Restaurer et remplacer les données'}
              </button>
              <button className="btn" onClick={closeRestoreDialog} disabled={restoring}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
