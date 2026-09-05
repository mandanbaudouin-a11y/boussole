import { createContext, useContext, useState, useCallback } from 'react'
import { useLanguage } from './i18n/LanguageContext'

const ConfirmContext = createContext(() => Promise.resolve(false))

// Remplace window.confirm() par une boîte de dialogue stylée (mêmes classes
// que les autres modales de l'app) dont les boutons sont traduits — un
// confirm() natif affiche toujours "OK"/"Cancel" (ou l'équivalent système),
// jamais "Annuler"/"Supprimer".
export function ConfirmProvider({ children }) {
  const { t } = useLanguage()
  const [request, setRequest] = useState(null)

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setRequest({ message, resolve })
    })
  }, [])

  const respond = (value) => {
    request?.resolve(value)
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="modal-backdrop" onClick={() => respond(false)}>
          <div className="modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <p className="report-body" style={{ marginTop: 0, fontSize: 16, color: 'var(--ink)' }}>
              {request.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button type="button" className="btn" onClick={() => respond(false)}>
                {t('Annuler')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => respond(true)} autoFocus>
                {t('Supprimer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

// Renvoie confirm(message) -> Promise<boolean>, à utiliser avec await avant
// toute suppression : if (await confirm(t('Supprimer cet objectif ?'))) { ... }
export function useConfirm() {
  return useContext(ConfirmContext)
}
