import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// En dev (npm run dev / npm run server), les données vivent dans <projet>/data.
// Dans l'app Electron packagée, main.js pointe PEI_CENTRAL_DATA_DIR vers le
// dossier de données utilisateur (le contenu de l'app est en lecture seule).
export const dataDir = process.env.PEI_CENTRAL_DATA_DIR || path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'pei-central.db')

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Titre/role descriptif du compte enseignant (distinct du role d'acces
// enseignant/EA de l'app, qui reste inchange).
export const TEACHER_TITLES = ['enseignant_titulaire', 'aide_enseignant', 'enseignant_ressource']
export const TEACHER_TITLE_LABELS = {
  enseignant_titulaire: 'Enseignant titulaire',
  aide_enseignant: 'Aide-enseignant',
  enseignant_ressource: 'Enseignant-ressource',
}

// Niveau de satisfaction d'un objectif de PEI. L'ordre reflete la progression
// attendue et sert aussi a trier/comparer si besoin plus tard.
export const GOAL_STATUSES = ['non_atteint', 'en_progres', 'atteint', 'depasse']
export const GOAL_STATUS_LABELS = {
  non_atteint: 'Non atteint',
  en_progres: 'En progrès',
  atteint: 'Atteint',
  depasse: 'Dépassé',
}

// Categories utilisees pour organiser la bibliotheque de strategies suggerees.
export const STRATEGY_CATEGORIES = ['langage', 'comportement', 'motricite', 'academique']
export const STRATEGY_CATEGORY_LABELS = {
  langage: 'Langage',
  comportement: 'Comportement',
  motricite: 'Motricité',
  academique: 'Académique',
}

// Adaptations et modifications sont des categories legalement distinctes :
// une adaptation change la facon d'enseigner/evaluer sans changer le programme,
// une modification change le programme/les attentes lui-meme. A ne pas
// confondre avec les "strategies pedagogiques" (technique liee a un objectif),
// qui restent une fonctionnalite separee.
export const ADAPTATION_SUBTYPES = ['pedagogique', 'environnementale', 'evaluation']
export const ADAPTATION_SUBTYPE_LABELS = {
  pedagogique: 'Pédagogique',
  environnementale: 'Environnementale',
  evaluation: 'Évaluation',
}

export const MODIFICATION_TYPES = ['niveau_scolaire_different', 'complexite_ajustee']
export const MODIFICATION_TYPE_LABELS = {
  niveau_scolaire_different: 'Niveau scolaire différent',
  complexite_ajustee: 'Complexité ajustée',
}

export const ACKNOWLEDGMENT_STATUSES = ['envoye', 'recu', 'en_attente']
export const ACKNOWLEDGMENT_STATUS_LABELS = {
  envoye: 'Envoyé',
  recu: 'Reçu',
  en_attente: 'En attente',
}

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade TEXT NOT NULL,
    next_review_date TEXT NOT NULL DEFAULT (date('now', '+30 days')),
    narrative_report TEXT,
    narrative_report_updated_at TEXT,
    birthdate TEXT,
    forces TEXT,
    besoins TEXT,
    consultation_date TEXT,
    consultation_method TEXT,
    copy_delivery_date TEXT,
    acknowledgment_status TEXT,
    applicable_transition INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'non_atteint',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS goal_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    changed_by TEXT
  );

  CREATE TABLE IF NOT EXISTS strategies_library (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS adaptations_library (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    subtype TEXT NOT NULL
  );

  -- field vaut 'forces' ou 'besoins' : une seule table pour les deux, comme
  -- les deux champs partagent la meme UI (suggestions cliquables au-dessus
  -- d'un texte libre), plutot que deux tables identiques.
  CREATE TABLE IF NOT EXISTS forces_besoins_library (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    field TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goal_strategies (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    category TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS adaptations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
    subtype TEXT NOT NULL,
    description TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS modifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transition_goals (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    responsible TEXT,
    target_date TEXT,
    community_resources TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transition_steps (
    id TEXT PRIMARY KEY,
    transition_goal_id TEXT NOT NULL REFERENCES transition_goals(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS weekly_rate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    week TEXT NOT NULL,
    pct INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'enseignant',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    nom_complet TEXT,
    courriel TEXT,
    ecole TEXT,
    division_scolaire TEXT,
    annee_scolaire TEXT,
    titre TEXT,
    laipvp_acknowledged INTEGER NOT NULL DEFAULT 0,
    laipvp_acknowledged_at TEXT
  );

  -- Journal d'audit des générations de rapport par IA : seulement le
  -- qui/quand/pour-quel-élève, jamais le contenu (prompt ou texte généré)
  -- ne contenant des données d'élève, conformément à la conformité LAIPVP/FIPPA.
  CREATE TABLE IF NOT EXISTS ai_generation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    generated_by TEXT,
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Historique des versions du rapport PEI : une ligne par export PDF, avec
  -- une copie complète des données de l'élève au moment de l'export
  -- (content_snapshot) pour pouvoir reconstituer exactement ce qui a été
  -- remis, même si le PEI change ensuite dans l'app (document vivant).
  CREATE TABLE IF NOT EXISTS report_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exported_at TEXT NOT NULL DEFAULT (datetime('now')),
    exported_by TEXT,
    content_snapshot TEXT NOT NULL
  );

  -- Une ligne = le compte resource_user_id peut consulter/modifier les
  -- eleves du compte owner_user_id (collaboration enseignant-ressource sur
  -- plusieurs classes). Voir aussi students.teacher_id et users.teacher_id.
  CREATE TABLE IF NOT EXISTS teacher_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(resource_user_id, owner_user_id)
  );
`)

// Migration : les bases créées avant l'ajout du rôle EA n'ont pas la colonne.
// Les comptes existants deviennent des comptes enseignant (comportement inchangé).
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!userColumns.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'enseignant'")
}

// Migration : profil enseignant complété (nom complet, courriel, école, etc.).
// NULL partout = champ non renseigné (comportement inchangé pour les comptes existants).
if (!userColumns.includes('nom_complet')) {
  db.exec('ALTER TABLE users ADD COLUMN nom_complet TEXT')
  db.exec('ALTER TABLE users ADD COLUMN courriel TEXT')
  db.exec('ALTER TABLE users ADD COLUMN ecole TEXT')
  db.exec('ALTER TABLE users ADD COLUMN division_scolaire TEXT')
  db.exec('ALTER TABLE users ADD COLUMN annee_scolaire TEXT')
  db.exec('ALTER TABLE users ADD COLUMN titre TEXT')
  db.exec("ALTER TABLE users ADD COLUMN laipvp_acknowledged INTEGER NOT NULL DEFAULT 0")
  db.exec('ALTER TABLE users ADD COLUMN laipvp_acknowledged_at TEXT')
}

// Migration : les bases créées avant l'ajout du niveau de satisfaction n'ont
// pas la colonne. Un objectif deja coche est raisonnablement considere comme
// "Atteint" ; les autres restent "Non atteint". On pose aussi un premier
// historique pour que l'ecran d'historique ne soit pas vide juste apres la mise a jour.
const goalColumns = db.prepare('PRAGMA table_info(goals)').all().map((c) => c.name)
if (!goalColumns.includes('status')) {
  db.exec("ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'non_atteint'")
  db.exec("UPDATE goals SET status = 'atteint' WHERE done = 1")
  const insertInitialHistory = db.prepare(
    'INSERT INTO goal_status_history (goal_id, status, changed_by) VALUES (?, ?, ?)'
  )
  const existingGoals = db.prepare('SELECT id, status FROM goals').all()
  const backfill = db.transaction(() => {
    for (const g of existingGoals) insertInitialHistory.run(g.id, g.status, null)
  })
  backfill()
}

// Migration : les bases créées avant le rappel de révision remplacent le
// compteur statique "jours avant révision" (jamais décrémenté automatiquement)
// par une vraie date de révision, calculée une fois à partir de l'ancienne
// valeur puis conservée telle quelle par la suite.
const studentColumnsBeforeReview = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name)
if (studentColumnsBeforeReview.includes('review_in_days') && !studentColumnsBeforeReview.includes('next_review_date')) {
  db.exec('ALTER TABLE students ADD COLUMN next_review_date TEXT')
  db.exec("UPDATE students SET next_review_date = date('now', '+' || review_in_days || ' days')")
  db.exec('ALTER TABLE students DROP COLUMN review_in_days')
}

// Migration : les bases créées avant la rédaction de rapport par IA n'ont pas
// ces colonnes. NULL = aucun résumé narratif enregistré, le rapport retombe
// sur le résumé calculé automatiquement (comportement inchangé).
const studentColumns = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name)
if (!studentColumns.includes('narrative_report')) {
  db.exec('ALTER TABLE students ADD COLUMN narrative_report TEXT')
  db.exec('ALTER TABLE students ADD COLUMN narrative_report_updated_at TEXT')
}

// Migration : les bases créées avant la page dédiée élève n'ont pas la date
// de naissance (utilisée pour déterminer si l'onglet "Plan de transition"
// s'applique, à 14 ans et plus). NULL = âge inconnu, onglet masqué.
if (!studentColumns.includes('birthdate')) {
  db.exec('ALTER TABLE students ADD COLUMN birthdate TEXT')
}

// Migration : les bases créées avant la conformité aux normes de PEI n'ont
// pas ces colonnes. NULL = non renseigné, la section reste vide dans le profil.
if (!studentColumns.includes('forces')) {
  db.exec('ALTER TABLE students ADD COLUMN forces TEXT')
  db.exec('ALTER TABLE students ADD COLUMN besoins TEXT')
}

// Migration : suivi de consultation parentale et remise de copie du PEI.
if (!studentColumns.includes('consultation_date')) {
  db.exec('ALTER TABLE students ADD COLUMN consultation_date TEXT')
  db.exec('ALTER TABLE students ADD COLUMN consultation_method TEXT')
  db.exec('ALTER TABLE students ADD COLUMN copy_delivery_date TEXT')
  db.exec('ALTER TABLE students ADD COLUMN acknowledgment_status TEXT')
}

// Migration : bascule manuelle pour rendre l'onglet "Plan de transition"
// applicable à un élève de moins de 14 ans (en plus du critère d'âge automatique).
if (!studentColumns.includes('applicable_transition')) {
  db.exec('ALTER TABLE students ADD COLUMN applicable_transition INTEGER NOT NULL DEFAULT 0')
}

// Migration : associe la remise de copie (copy_delivery_date) à une version
// precise de l'historique des rapports — repond a "quelle version le parent
// a-t-il recue ?". NULL = aucune version associee (remise non enregistree,
// ou remise anterieure a l'existence de cette fonctionnalite). Pas de
// contrainte REFERENCES declaree ici (coherent avec les autres migrations
// ALTER de ce fichier) ; la validite est verifiee cote application.
if (!studentColumns.includes('delivered_version_id')) {
  db.exec('ALTER TABLE students ADD COLUMN delivered_version_id INTEGER')
}

// Migration : collaboration enseignant-ressource sur plusieurs classes.
// Chaque eleve appartient desormais a un compte enseignant precis
// (teacher_id), et chaque compte EA est supervise par un compte enseignant
// precis (users.teacher_id, sans rapport avec le meme nom de colonne sur
// students). Backfill immediat vers le premier compte enseignant de la base
// (le seul qui existe avant cette fonctionnalite) : une installation a un
// seul enseignant continue de tout voir exactement comme avant, sans aucune
// reconfiguration.
if (!studentColumns.includes('teacher_id')) {
  db.exec('ALTER TABLE students ADD COLUMN teacher_id TEXT')
  const firstTeacher = db.prepare("SELECT id FROM users WHERE role = 'enseignant' ORDER BY created_at ASC LIMIT 1").get()
  if (firstTeacher) {
    db.prepare('UPDATE students SET teacher_id = ? WHERE teacher_id IS NULL').run(firstTeacher.id)
  }
}

if (!userColumns.includes('teacher_id')) {
  db.exec('ALTER TABLE users ADD COLUMN teacher_id TEXT')
  const firstTeacher = db.prepare("SELECT id FROM users WHERE role = 'enseignant' ORDER BY created_at ASC LIMIT 1").get()
  if (firstTeacher) {
    db.prepare("UPDATE users SET teacher_id = ? WHERE role = 'ea' AND teacher_id IS NULL").run(firstTeacher.id)
  }
}

// Migration : compte "proprietaire" de l'installation — seul a pouvoir gerer
// les autres comptes, le reglage reseau local et les assignations
// enseignant-ressource (teacher_assignments). Le tout premier compte
// enseignant jamais cree devient proprietaire automatiquement (voir aussi
// createAccount() dans auth.js, qui applique la meme regle a la creation).
if (!userColumns.includes('is_owner')) {
  db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0')
  const firstTeacher = db.prepare("SELECT id FROM users WHERE role = 'enseignant' ORDER BY created_at ASC LIMIT 1").get()
  if (firstTeacher) {
    db.prepare('UPDATE users SET is_owner = 1 WHERE id = ?').run(firstTeacher.id)
  }
}

// Migration : tracabilite des contributions — savoir qui a modifie quoi et
// quand, utile des que deux comptes (titulaire + ressource assignee)
// collaborent sur le meme eleve. NULL = jamais modifie depuis l'ajout de
// cette fonctionnalite (aucun backfill : pas d'auteur a inventer pour les
// donnees existantes).
if (!studentColumns.includes('modified_by')) {
  db.exec('ALTER TABLE students ADD COLUMN modified_by TEXT')
  db.exec('ALTER TABLE students ADD COLUMN modified_at TEXT')
}
if (!goalColumns.includes('modified_by')) {
  db.exec('ALTER TABLE goals ADD COLUMN modified_by TEXT')
  db.exec('ALTER TABLE goals ADD COLUMN modified_at TEXT')
}
const adaptationsColumns = db.prepare('PRAGMA table_info(adaptations)').all().map((c) => c.name)
if (!adaptationsColumns.includes('modified_by')) {
  db.exec('ALTER TABLE adaptations ADD COLUMN modified_by TEXT')
  db.exec('ALTER TABLE adaptations ADD COLUMN modified_at TEXT')
}
const modificationsColumns = db.prepare('PRAGMA table_info(modifications)').all().map((c) => c.name)
if (!modificationsColumns.includes('modified_by')) {
  db.exec('ALTER TABLE modifications ADD COLUMN modified_by TEXT')
  db.exec('ALTER TABLE modifications ADD COLUMN modified_at TEXT')
}

const studentCount = db.prepare('SELECT COUNT(*) AS n FROM students').get().n

if (studentCount === 0) {
  seed()
}

const strategyLibraryCount = db.prepare('SELECT COUNT(*) AS n FROM strategies_library').get().n

if (strategyLibraryCount === 0) {
  seedStrategyLibrary()
}

const adaptationsLibraryCount = db.prepare('SELECT COUNT(*) AS n FROM adaptations_library').get().n

if (adaptationsLibraryCount === 0) {
  seedAdaptationsLibrary()
}

const forcesBesoinsLibraryCount = db.prepare('SELECT COUNT(*) AS n FROM forces_besoins_library').get().n

if (forcesBesoinsLibraryCount === 0) {
  seedForcesBesoinsLibrary()
}

function seedAdaptationsLibrary() {
  const insertAdaptation = db.prepare('INSERT INTO adaptations_library (id, label, subtype) VALUES (?, ?, ?)')
  const adaptations = [
    { subtype: 'pedagogique', label: 'Temps supplémentaire aux évaluations' },
    { subtype: 'pedagogique', label: 'Consignes lues à voix haute' },
    { subtype: 'pedagogique', label: 'Reformulation des consignes en phrases courtes' },
    { subtype: 'pedagogique', label: 'Bande de vocabulaire ou lexique visuel au pupitre' },
    { subtype: 'pedagogique', label: "Utilisation d'un surligneur pour cibler l'information essentielle" },
    { subtype: 'pedagogique', label: 'Réduction du nombre de choix de réponses (questions à choix multiples)' },
    { subtype: 'pedagogique', label: 'Accès à une calculatrice pour les évaluations de mathématiques' },
    { subtype: 'pedagogique', label: "Utilisation d'un correcteur orthographique ou d'un logiciel de dictée" },
    { subtype: 'pedagogique', label: 'Copie des notes de cours fournie plutôt que prise de notes' },
    { subtype: 'pedagogique', label: 'Pauses fréquentes pendant les évaluations longues' },
    { subtype: 'pedagogique', label: "Modèles ou exemples fournis avant une nouvelle tâche" },
    { subtype: 'pedagogique', label: 'Enregistrement audio des consignes disponible' },
    { subtype: 'environnementale', label: "Placement préférentiel près de l'enseignant" },
    { subtype: 'environnementale', label: 'Réduction des stimuli visuels ou auditifs au pupitre' },
    { subtype: 'environnementale', label: 'Accès à un casque antibruit' },
    { subtype: 'environnementale', label: 'Horaire visuel des transitions affiché' },
    { subtype: 'environnementale', label: 'Espace de travail isolé disponible au besoin' },
    { subtype: 'environnementale', label: 'Signal visuel convenu pour demander une pause' },
    { subtype: 'environnementale', label: "Accès à un ballon d'exercice ou coussin sensoriel comme siège" },
    { subtype: 'environnementale', label: "Trajet prévisible prévu pour les déplacements dans l'école" },
    { subtype: 'environnementale', label: 'Accès prioritaire au vestiaire pour éviter la cohue' },
    { subtype: 'environnementale', label: 'Zone calme désignée pour la régulation émotionnelle' },
    { subtype: 'evaluation', label: 'Temps supplémentaire de 50 % aux évaluations' },
    { subtype: 'evaluation', label: 'Évaluation dans un local calme séparé' },
    { subtype: 'evaluation', label: 'Réponses orales acceptées plutôt qu\'écrites' },
    { subtype: 'evaluation', label: "Fractionnement de l'évaluation en plusieurs séances" },
    { subtype: 'evaluation', label: "Grille d'évaluation adaptée communiquée à l'avance" },
    { subtype: 'evaluation', label: "Utilisation d'un support visuel pendant l'évaluation" },
    { subtype: 'evaluation', label: "Reformulation des questions au besoin par l'enseignant" },
    { subtype: 'evaluation', label: 'Présentation orale plutôt qu\'écrite acceptée' },
    { subtype: 'evaluation', label: "Correction axée sur le contenu plutôt que l'orthographe ou la grammaire" },
    { subtype: 'evaluation', label: 'Accès à un ordinateur pour rédiger les réponses' },
  ]
  const run = db.transaction(() => {
    for (const a of adaptations) insertAdaptation.run(randomUUID(), a.label, a.subtype)
  })
  run()
}

function seedForcesBesoinsLibrary() {
  const insertEntry = db.prepare('INSERT INTO forces_besoins_library (id, label, field) VALUES (?, ?, ?)')
  const entries = [
    { field: 'forces', label: "S'exprime avec aisance à l'oral" },
    { field: 'forces', label: 'Fait preuve de curiosité et pose des questions pertinentes' },
    { field: 'forces', label: 'Persévère devant une tâche difficile' },
    { field: 'forces', label: 'Travaille bien en collaboration avec ses pairs' },
    { field: 'forces', label: 'Démontre de bonnes habiletés en résolution de problèmes' },
    { field: 'forces', label: 'A une excellente mémoire pour les faits et les détails' },
    { field: 'forces', label: 'Fait preuve de créativité dans ses réalisations' },
    { field: 'forces', label: "Accepte volontiers l'aide d'un adulte" },
    { field: 'forces', label: 'A un bon sens de l\'humour qui facilite les relations sociales' },
    { field: 'forces', label: 'Démontre de l\'empathie envers ses camarades' },
    { field: 'forces', label: 'Aime les arts et s\'exprime bien par ce médium' },
    { field: 'forces', label: 'Fait preuve d\'autonomie dans les routines connues' },
    { field: 'besoins', label: 'Décodage des mots nouveaux en lecture' },
    { field: 'besoins', label: 'Régulation émotionnelle lors des transitions non annoncées' },
    { field: 'besoins', label: "Ponctuation et structure de phrase à l'écrit" },
    { field: 'besoins', label: 'Maintien de l\'attention lors des tâches prolongées' },
    { field: 'besoins', label: "Gestion de l'impulsivité en groupe" },
    { field: 'besoins', label: 'Compréhension des consignes à plusieurs étapes' },
    { field: 'besoins', label: "Motricité fine pour l'écriture manuscrite" },
    { field: 'besoins', label: 'Interactions sociales avec les pairs' },
    { field: 'besoins', label: 'Organisation du matériel scolaire' },
    { field: 'besoins', label: 'Généralisation des apprentissages à de nouveaux contextes' },
    { field: 'besoins', label: 'Gestion de l\'anxiété face à la nouveauté' },
    { field: 'besoins', label: 'Autorégulation sensorielle dans les environnements bruyants' },
  ]
  const run = db.transaction(() => {
    for (const e of entries) insertEntry.run(randomUUID(), e.label, e.field)
  })
  run()
}

function seedStrategyLibrary() {
  const insertStrategy = db.prepare('INSERT INTO strategies_library (id, label, category) VALUES (?, ?, ?)')
  const strategies = [
    { category: 'langage', label: 'Utiliser des pictogrammes ou un système de communication visuelle' },
    { category: 'langage', label: 'Reformuler la consigne en phrases courtes' },
    { category: 'langage', label: 'Encourager la prise de parole par des questions ouvertes' },
    { category: 'langage', label: 'Modeler le vocabulaire cible avant la tâche' },
    { category: 'comportement', label: 'Établir un système de renforcement positif (jetons, autocollants)' },
    { category: 'comportement', label: 'Prévoir un signal visuel pour demander une pause' },
    { category: 'comportement', label: "Structurer les transitions avec un support visuel (horaire imagé)" },
    { category: 'comportement', label: 'Ignorer intentionnellement les comportements mineurs non dangereux' },
    { category: 'motricite', label: 'Adapter le matériel (crayon ergonomique, papier ligné agrandi)' },
    { category: 'motricite', label: 'Fractionner la tâche motrice en étapes courtes' },
    { category: 'motricite', label: 'Offrir des pauses de mouvement régulières' },
    { category: 'motricite', label: "Utiliser un support d'écriture incliné" },
    { category: 'academique', label: 'Réduire la charge de travail visible (cacher les exercices non actifs)' },
    { category: 'academique', label: "Utiliser un surligneur pour cibler l'information essentielle" },
    { category: 'academique', label: 'Offrir un temps supplémentaire pour les évaluations' },
    { category: 'academique', label: 'Jumeler avec un pair-tuteur pour la relecture' },
  ]
  const run = db.transaction(() => {
    for (const s of strategies) insertStrategy.run(randomUUID(), s.label, s.category)
  })
  run()
}

// N'utilise pas toISOString() : ça convertit en UTC et peut décaler la date
// d'un jour en soirée pour un fuseau horaire à l'ouest de l'UTC (ex. Manitoba).
function dateInDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function seed() {
  const insertStudent = db.prepare(
    'INSERT INTO students (id, name, grade, next_review_date) VALUES (?, ?, ?, ?)'
  )
  const insertGoal = db.prepare(
    'INSERT INTO goals (id, student_id, label, status, position) VALUES (?, ?, ?, ?, ?)'
  )
  const insertGoalHistory = db.prepare(
    'INSERT INTO goal_status_history (goal_id, status, changed_by) VALUES (?, ?, ?)'
  )
  const insertWeek = db.prepare(
    'INSERT INTO weekly_rate (student_id, week, pct) VALUES (?, ?, ?)'
  )
  const insertNote = db.prepare(
    'INSERT INTO notes (student_id, date, text) VALUES (?, ?, ?)'
  )

  const seedData = [
    {
      id: 'samuel-l',
      name: 'Samuel L.',
      grade: '2e année',
      nextReviewDate: dateInDays(12),
      goals: [
        { label: 'Rester assis 10 min sans se lever', status: 'atteint' },
        { label: 'Lever la main avant de parler', status: 'en_progres' },
        { label: 'Faire une transition sans soutien verbal', status: 'depasse' },
      ],
      weeklyRate: [
        { week: 'Sem. 1', pct: 40 },
        { week: 'Sem. 2', pct: 55 },
        { week: 'Sem. 3', pct: 50 },
        { week: 'Sem. 4', pct: 70 },
      ],
      notes: [
        { date: '20 août', text: "Bonne journée, a demandé de l'aide avant de perdre patience." },
        { date: '19 août', text: 'Difficulté à la transition du dîner, retour au calme après 5 min.' },
      ],
    },
    {
      id: 'mia-t',
      name: 'Mia T.',
      grade: 'Maternelle',
      nextReviewDate: dateInDays(41),
      goals: [
        { label: "Utiliser un pictogramme pour demander de l'aide", status: 'non_atteint' },
        { label: 'Suivre la routine du matin sans accompagnement', status: 'atteint' },
      ],
      weeklyRate: [
        { week: 'Sem. 1', pct: 20 },
        { week: 'Sem. 2', pct: 35 },
        { week: 'Sem. 3', pct: 45 },
        { week: 'Sem. 4', pct: 60 },
      ],
      notes: [{ date: '20 août', text: 'A utilisé le pictogramme deux fois sans rappel.' }],
    },
    {
      id: 'noah-b',
      name: 'Noah B.',
      grade: '1re année',
      nextReviewDate: dateInDays(3),
      goals: [
        { label: 'Écrire son prénom sans modèle', status: 'atteint' },
        { label: 'Rester dans le groupe lors des déplacements', status: 'en_progres' },
        { label: 'Utiliser des mots plutôt que des gestes', status: 'non_atteint' },
      ],
      weeklyRate: [
        { week: 'Sem. 1', pct: 60 },
        { week: 'Sem. 2', pct: 65 },
        { week: 'Sem. 3', pct: 58 },
        { week: 'Sem. 4', pct: 80 },
      ],
      notes: [
        { date: '20 août', text: 'Excellente journée, a écrit son prénom sans aide.' },
        { date: '18 août', text: "A eu besoin d'un rappel visuel pour rester avec le groupe." },
      ],
    },
  ]

  const run = db.transaction(() => {
    for (const s of seedData) {
      insertStudent.run(s.id, s.name, s.grade, s.nextReviewDate)
      s.goals.forEach((g, i) => {
        const goalId = randomUUID()
        insertGoal.run(goalId, s.id, g.label, g.status, i)
        insertGoalHistory.run(goalId, g.status, null)
      })
      s.weeklyRate.forEach((w) => insertWeek.run(s.id, w.week, w.pct))
      s.notes.forEach((n) => insertNote.run(s.id, n.date, n.text))
    }
  })
  run()
}
