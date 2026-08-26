// Dictionnaire anglais cote serveur, pour le rendu PDF (server/pdfReport.js).
// Meme principe que src/i18n/en.js cote client : le texte francais sert de
// cle. Garde volontairement separe du dictionnaire client (pas de bundler
// partage entre le frontend Vite et ce serveur Node), mais les cles
// partagees (statuts, categories, types) restent identiques mot pour mot
// pour rester faciles a synchroniser a la main.
export const en = {
  'École non précisée': 'School not specified',
  'Rapport de progrès': 'Progress report',
  'Généré le': 'Generated on',
  par: 'by',

  'Forces et besoins': 'Strengths and needs',
  FORCES: 'STRENGTHS',
  BESOINS: 'NEEDS',
  Adaptations: 'Accommodations',
  Modifications: 'Modifications',
  "Liée à l'objectif": 'Linked to goal',
  'Matière': 'Subject',
  'Plan de transition': 'Transition plan',
  Responsable: 'Responsible',
  'Délai prévu': 'Target date',
  'Ressources communautaires': 'Community resources',
  Résumé: 'Summary',
  'Objectifs suivis': 'Goals tracked',
  "Notes de l'enseignant": "Teacher's notes",

  'Non atteint': 'Not achieved',
  'En progrès': 'In progress',
  Atteint: 'Achieved',
  Dépassé: 'Exceeded',

  Langage: 'Language',
  Comportement: 'Behaviour',
  Motricité: 'Motor skills',
  Académique: 'Academic',

  Pédagogique: 'Pedagogical',
  Environnementale: 'Environmental',
  Évaluation: 'Assessment',
  'Niveau scolaire différent': 'Different grade level',
  'Complexité ajustée': 'Adjusted complexity',
}

export function t(key, lang) {
  return lang === 'en' ? en[key] ?? key : key
}
