const AVATAR_COLORS = ['#028090', '#02C39A', '#0C7C8C', '#3AA98C', '#0A6E7E', '#57B79E']

export function initials(name) {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// Couleur déterministe par élève (basée sur son id) — stable même si la
// liste est filtrée ou réordonnée, contrairement à une couleur par index.
export function avatarColor(seed) {
  const s = String(seed || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
