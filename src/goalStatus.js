export const GOAL_STATUSES = [
  { value: 'non_atteint', label: 'Non atteint' },
  { value: 'en_progres', label: 'En progrès' },
  { value: 'atteint', label: 'Atteint' },
  { value: 'depasse', label: 'Dépassé' },
]

export const GOAL_STATUS_LABELS = Object.fromEntries(GOAL_STATUSES.map((s) => [s.value, s.label]))

// Icône en plus de la couleur pour chaque statut — l'information ne doit
// jamais reposer sur la couleur seule (accessibilité, daltonisme).
export const GOAL_STATUS_ICONS = {
  non_atteint: '○',
  en_progres: '◐',
  atteint: '✓',
  depasse: '★',
}

// SQLite renvoie datetime('now') en UTC sans indicateur de fuseau
// ("YYYY-MM-DD HH:MM:SS") ; on l'ajoute pour un parsing fiable partout.
export function formatHistoryDate(changedAt) {
  const d = new Date(changedAt.replace(' ', 'T') + 'Z')
  const date = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}
