// Palette dédiée aux enseignants-ressource dans la navigation Direction —
// distincte de AVATAR_COLORS (src/avatar.js, famille teal/menthe des avatars
// d'élèves) et des couleurs sémantiques existantes (--mark ambre pour les
// avertissements, --urgent terracotta pour les suppressions/retards), pour
// éviter toute confusion visuelle avec ces usages déjà établis.
const RESOURCE_TEACHER_COLORS = [
  '#028090', // chalk (teinte de base de l'app)
  '#02C39A', // mint (teinte de base de l'app)
  '#5B6E8C', // bleu ardoise
  '#C17A52', // terracotta doux
  '#B08A2E', // jaune moutarde
  '#7C6A93', // violet poussiéreux
]

// Couleur déterministe par enseignant-ressource (même hash que avatarColor()
// dans avatar.js, palette différente) — jamais stockée, stable tant que
// l'id ne change pas. À utiliser en couleur de texte ou en pastille pleine,
// jamais en fond derrière du texte (toutes les teintes sont assez foncées
// pour rester lisibles en texte sur fond clair, mais pas forcément pour du
// texte clair par-dessus).
export function getResourceTeacherColor(userId) {
  const s = String(userId || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return RESOURCE_TEACHER_COLORS[hash % RESOURCE_TEACHER_COLORS.length]
}
