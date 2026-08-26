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

export function reviewDaysLabel(days) {
  if (days < 0) return `en retard de ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`
  if (days === 0) return "aujourd'hui"
  return `dans ${days} jour${days > 1 ? 's' : ''}`
}
