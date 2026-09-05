// Horodatage de la derniere sauvegarde EXPORTEE (jamais mis a jour par une
// restauration), garde localement (localStorage) : purement indicatif pour
// rappeler a l'enseignant s'il est a risque de perdre des donnees recentes,
// ne reflete pas forcement une sauvegarde encore presente sur le disque.
const STORAGE_KEY = 'repere-last-backup-at'

export function getLastBackupAt() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setLastBackupAt(isoTimestamp) {
  try {
    localStorage.setItem(STORAGE_KEY, isoTimestamp)
  } catch {
    // stockage indisponible (mode privé, etc.) — l'export a quand même eu
    // lieu, on perd juste le rappel visuel pour la prochaine fois
  }
}

// t est le t() de useLanguage() ; optionnel pour les appelants qui n'ont pas
// accès au contexte de langue (garde le français par défaut dans ce cas).
export function lastBackupLabel(isoTimestamp, t = (s) => s) {
  if (!isoTimestamp) return t('Aucune sauvegarde effectuée')
  const then = new Date(isoTimestamp)
  if (Number.isNaN(then.getTime())) return t('Aucune sauvegarde effectuée')

  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const startOfNow = new Date()
  startOfNow.setHours(0, 0, 0, 0)
  const days = Math.round((startOfNow - startOfThen) / (1000 * 60 * 60 * 24))

  if (days <= 0) return t("Dernière sauvegarde : aujourd'hui")
  if (days === 1) return t('Dernière sauvegarde : hier')
  return t('Dernière sauvegarde : il y a {n} jours', { n: days })
}
