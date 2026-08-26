// N'utilise jamais toISOString() ici : ça convertit en UTC et peut décaler la
// date d'un jour en soirée pour un fuseau horaire à l'ouest de l'UTC (ex.
// Manitoba). On formate plutôt les composantes locales directement.
export function defaultNextReviewDate() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// t est le t() de useLanguage() ; optionnel pour les appelants qui n'ont pas
// accès au contexte de langue (garde le français par défaut dans ce cas).
export function reviewDaysLabel(days, t = (s) => s) {
  const n = Math.abs(days)
  if (days < 0) return t(n > 1 ? 'en retard de {n} jours' : 'en retard de {n} jour', { n })
  if (days === 0) return t("aujourd'hui")
  return t(days > 1 ? 'dans {n} jours' : 'dans {n} jour', { n: days })
}
