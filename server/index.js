import express from 'express'
import session from 'express-session'
import multer from 'multer'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  db,
  GOAL_STATUSES,
  STRATEGY_CATEGORIES,
  ADAPTATION_SUBTYPES,
  MODIFICATION_TYPES,
  ACKNOWLEDGMENT_STATUSES,
  TEACHER_TITLES,
} from './db.js'
import { extractText, guessFields } from './textExtract.js'
import { streamStudentReportPdf, streamCombinedReportPdf } from './pdfReport.js'
import { generateNarrativeReport, suggestFieldText } from './aiReport.js'
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  hasApiKey,
  setApiKey,
  clearApiKey,
  getActiveProvider,
  setActiveProvider,
} from './aiConfig.js'
import {
  getSessionSecret,
  SESSION_MAX_AGE_MS,
  hasTeacherAccount,
  createAccount,
  findUserByUsername,
  listAccounts,
  listAssignments,
  createAssignment,
  deleteAssignment,
  verifyPassword,
  isLockedOut,
  registerFailedAttempt,
  clearFailedAttempts,
  requireAuth,
  requireRole,
  requireOwner,
  getUserProfile,
  getTeacherProfile,
  updateProfile,
} from './auth.js'
import { isLanSharingEnabled, setLanSharingEnabled, getLanAddresses } from './networkConfig.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const app = express()
app.use(express.json())

app.use(
  session({
    name: 'pei_central_sid',
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true, // prolonge la session à chaque requête -> déconnexion après inactivité, pas à heure fixe
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // a passer a true si le site est un jour servi en HTTPS
      maxAge: SESSION_MAX_AGE_MS,
    },
  })
)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

const getStudentRow = db.prepare('SELECT * FROM students WHERE id = ?')
const getGoalsForStudent = db.prepare('SELECT * FROM goals WHERE student_id = ? ORDER BY position ASC, rowid ASC')
const getWeeklyRateForStudent = db.prepare('SELECT week, pct FROM weekly_rate WHERE student_id = ? ORDER BY id ASC')
const getNotesForStudent = db.prepare('SELECT id, date, text FROM notes WHERE student_id = ? ORDER BY id DESC')
const getStatusHistoryForGoal = db.prepare(
  'SELECT status, changed_at, changed_by FROM goal_status_history WHERE goal_id = ? ORDER BY changed_at DESC, id DESC'
)
const insertGoalStatusHistory = db.prepare(
  'INSERT INTO goal_status_history (goal_id, status, changed_by) VALUES (?, ?, ?)'
)
const getStrategiesForGoal = db.prepare(
  'SELECT id, label, category FROM goal_strategies WHERE goal_id = ? ORDER BY position ASC, rowid ASC'
)
const getAdaptationsForStudent = db.prepare(`
  SELECT a.id, a.subtype, a.description, a.goal_id AS goalId, g.label AS goalLabel,
         a.modified_by, a.modified_at
  FROM adaptations a
  LEFT JOIN goals g ON g.id = a.goal_id
  WHERE a.student_id = ?
  ORDER BY a.position ASC, a.rowid ASC
`)
const getModificationsForStudent = db.prepare(
  'SELECT id, type, subject, description, modified_by, modified_at FROM modifications WHERE student_id = ? ORDER BY position ASC, rowid ASC'
)
const getTransitionGoalsForStudent = db.prepare(
  `SELECT id, description, responsible, target_date AS targetDate, community_resources AS communityResources
   FROM transition_goals WHERE student_id = ? ORDER BY position ASC, rowid ASC`
)
const getTransitionStepsForGoal = db.prepare(
  'SELECT id, description FROM transition_steps WHERE transition_goal_id = ? ORDER BY position ASC, rowid ASC'
)
const insertReportVersion = db.prepare(
  'INSERT INTO report_versions (student_id, exported_by, content_snapshot) VALUES (?, ?, ?)'
)

// ---------- Traçabilité des contributions ----------
// modified_by stocke un id utilisateur (voir migrations dans server/db.js) ;
// l'affichage résout toujours le nom complet ici plutôt que par une jointure
// SQL à chaque requête — plus simple à appliquer uniformément partout où un
// modified_by est renvoyé au client (élève, objectif, adaptation,
// modification, historique de statut). Repli sur la valeur brute si elle ne
// correspond à aucun compte (ex. ancien format username dans
// goal_status_history.changed_by, avant cette fonctionnalité).
const getUserNameStmt = db.prepare('SELECT nom_complet, username FROM users WHERE id = ?')
function getUserName(userId) {
  if (!userId) return null
  const row = getUserNameStmt.get(userId)
  return row ? row.nom_complet || row.username : userId
}

function withModifiedBy(row) {
  const { modified_by, modified_at, ...rest } = row
  return { ...rest, modifiedBy: getUserName(modified_by), modifiedAt: modified_at }
}

// ---------- Portée des données (collaboration enseignant-ressource) ----------
// Un compte enseignant voit toujours ses propres élèves, plus ceux de tout
// compte enseignant qui lui a accordé une assignation (teacher_assignments).
// Un compte EA ne voit que les élèves du compte enseignant qu'il assiste
// (users.teacher_id). Calculée à chaque requête (pas de cache en session) :
// une assignation créée ou retirée prend effet immédiatement, sans
// reconnexion. Pas de db.prepare() unique en tête de fichier ici, contrairement
// au reste de ce module : la clause IN (...) a une taille qui dépend de la
// session, donc la requête est reconstruite à chaque appel.
function accessibleTeacherIds(req) {
  if (req.session.role === 'ea') {
    const row = db.prepare('SELECT teacher_id FROM users WHERE id = ?').get(req.session.userId)
    return row?.teacher_id ? [row.teacher_id] : []
  }
  const grants = db
    .prepare('SELECT owner_user_id FROM teacher_assignments WHERE resource_user_id = ?')
    .all(req.session.userId)
  return [req.session.userId, ...grants.map((g) => g.owner_user_id)]
}

function accessFilter(req) {
  const ids = accessibleTeacherIds(req)
  return { placeholders: ids.map(() => '?').join(',') || 'NULL', ids }
}

function getAccessibleStudent(req, studentId) {
  const { placeholders, ids } = accessFilter(req)
  return db.prepare(`SELECT * FROM students WHERE id = ? AND teacher_id IN (${placeholders})`).get(studentId, ...ids)
}

function getAccessibleGoal(req, goalId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(`SELECT g.* FROM goals g JOIN students s ON s.id = g.student_id WHERE g.id = ? AND s.teacher_id IN (${placeholders})`)
    .get(goalId, ...ids)
}

function getAccessibleStrategy(req, strategyId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(
      `SELECT gs.* FROM goal_strategies gs
       JOIN goals g ON g.id = gs.goal_id
       JOIN students s ON s.id = g.student_id
       WHERE gs.id = ? AND s.teacher_id IN (${placeholders})`
    )
    .get(strategyId, ...ids)
}

function getAccessibleAdaptation(req, adaptationId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(`SELECT a.* FROM adaptations a JOIN students s ON s.id = a.student_id WHERE a.id = ? AND s.teacher_id IN (${placeholders})`)
    .get(adaptationId, ...ids)
}

function getAccessibleModification(req, modificationId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(`SELECT m.* FROM modifications m JOIN students s ON s.id = m.student_id WHERE m.id = ? AND s.teacher_id IN (${placeholders})`)
    .get(modificationId, ...ids)
}

function getAccessibleTransitionGoal(req, goalId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(
      `SELECT tg.* FROM transition_goals tg JOIN students s ON s.id = tg.student_id WHERE tg.id = ? AND s.teacher_id IN (${placeholders})`
    )
    .get(goalId, ...ids)
}

function getAccessibleTransitionStep(req, stepId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(
      `SELECT ts.* FROM transition_steps ts
       JOIN transition_goals tg ON tg.id = ts.transition_goal_id
       JOIN students s ON s.id = tg.student_id
       WHERE ts.id = ? AND s.teacher_id IN (${placeholders})`
    )
    .get(stepId, ...ids)
}

function getAccessibleReportVersion(req, versionId) {
  const { placeholders, ids } = accessFilter(req)
  return db
    .prepare(
      `SELECT rv.* FROM report_versions rv JOIN students s ON s.id = rv.student_id WHERE rv.id = ? AND s.teacher_id IN (${placeholders})`
    )
    .get(versionId, ...ids)
}

function toTransitionGoalDTO(g) {
  return { ...g, steps: getTransitionStepsForGoal.all(g.id) }
}

function toGoalDTO(g) {
  return {
    id: g.id,
    label: g.label,
    status: g.status,
    statusHistory: getStatusHistoryForGoal.all(g.id).map((h) => ({ ...h, changed_by: getUserName(h.changed_by) })),
    strategies: getStrategiesForGoal.all(g.id),
    modifiedBy: getUserName(g.modified_by),
    modifiedAt: g.modified_at,
  }
}

// "Jours restants" est toujours recalculé à partir de la date de révision
// (source de vérité) plutôt que stocké, pour qu'il reflète le jour courant
// sans dépendre d'un cron : chaque chargement de la liste des élèves le
// recalcule naturellement. Peut être négatif (révision en retard).
function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00Z').getTime()
  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - todayUTC) / 86400000)
}

// Âge calculé à partir de la date de naissance plutôt que stocké, même
// principe que "reviewInDays" — reste juste au fil du temps sans migration.
function ageFromBirthdate(birthdate) {
  if (!birthdate) return null
  const [by, bm, bd] = birthdate.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - by
  const hadBirthdayThisYear = now.getMonth() + 1 > bm || (now.getMonth() + 1 === bm && now.getDate() >= bd)
  if (!hadBirthdayThisYear) age -= 1
  return age
}

// La remise de copie est en retard si la consultation a eu lieu il y a plus
// de 30 jours et qu'aucune date de remise n'est encore enregistrée. Pas de
// notion de "PEI finalisé" dans l'app : la date de consultation sert d'ancrage
// à la place, faute d'un statut global de PEI (décision prise avec l'utilisateur).
const COPY_DELIVERY_DELAY_DAYS = 30
function isCopyDeliveryOverdue(consultationDate, copyDeliveryDate) {
  if (!consultationDate || copyDeliveryDate) return false
  const consult = new Date(consultationDate + 'T00:00:00Z').getTime()
  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const daysSince = Math.round((todayUTC - consult) / 86400000)
  return daysSince > COPY_DELIVERY_DELAY_DAYS
}

function toStudentDTO(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    nextReviewDate: row.next_review_date,
    reviewInDays: daysUntil(row.next_review_date),
    birthdate: row.birthdate,
    age: ageFromBirthdate(row.birthdate),
    forces: row.forces,
    besoins: row.besoins,
    adaptations: getAdaptationsForStudent.all(row.id).map(withModifiedBy),
    modifications: getModificationsForStudent.all(row.id).map(withModifiedBy),
    consultationDate: row.consultation_date,
    consultationMethod: row.consultation_method,
    copyDeliveryDate: row.copy_delivery_date,
    acknowledgmentStatus: row.acknowledgment_status,
    deliveredVersionId: row.delivered_version_id,
    copyDeliveryOverdue: isCopyDeliveryOverdue(row.consultation_date, row.copy_delivery_date),
    applicableTransition: !!row.applicable_transition,
    transitionGoals: getTransitionGoalsForStudent.all(row.id).map(toTransitionGoalDTO),
    goals: getGoalsForStudent.all(row.id).map(toGoalDTO),
    weeklyRate: getWeeklyRateForStudent.all(row.id),
    notes: getNotesForStudent.all(row.id),
    narrativeReport: row.narrative_report,
    narrativeReportUpdatedAt: row.narrative_report_updated_at,
    modifiedBy: getUserName(row.modified_by),
    modifiedAt: row.modified_at,
  }
}

function notFound(res, what) {
  return res.status(404).json({ error: `${what} introuvable` })
}

// ---------- Authentification ----------
// Deux rôles : enseignant (tous les droits) et EA (peut consulter et ajouter
// des notes, mais pas gérer les élèves ni le contenu du PEI). Tant qu'aucun
// compte enseignant n'existe, /setup permet de créer le premier (premier
// lancement) ; ensuite, n'importe quel compte enseignant peut créer d'autres
// comptes EA (/create-ea) ou enseignant (/create-enseignant — ex. pour un
// enseignant-ressource travaillant en collaboration sur les mêmes PEI).

app.get('/api/auth/status', (req, res) => {
  const authenticated = !!(req.session && req.session.userId)
  res.json({
    needsSetup: !hasTeacherAccount(),
    authenticated,
    username: req.session?.username || null,
    role: req.session?.role || null,
    profile: authenticated ? getUserProfile(req.session.userId) : null,
  })
})

app.post('/api/auth/setup', (req, res) => {
  if (hasTeacherAccount()) {
    return res.status(409).json({ error: 'Un compte enseignant existe déjà.' })
  }
  const username = (req.body.username || '').trim()
  const password = req.body.password || ''
  const nomComplet = (req.body.nomComplet || '').trim()
  const courriel = (req.body.courriel || '').trim()

  if (username.length < 3) {
    return res.status(400).json({ error: "Le nom d'utilisateur doit contenir au moins 3 caractères." })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' })
  }
  if (!nomComplet) {
    return res.status(400).json({ error: 'Le nom complet est requis.' })
  }
  if (!courriel || !EMAIL_RE.test(courriel)) {
    return res.status(400).json({ error: 'Un courriel valide est requis.' })
  }
  if (req.body.titre !== undefined && req.body.titre !== '' && !TEACHER_TITLES.includes(req.body.titre)) {
    return res.status(400).json({ error: 'Titre invalide.' })
  }

  const user = createAccount(username, password, 'enseignant', {
    nomComplet,
    courriel,
    ecole: (req.body.ecole || '').trim() || null,
    divisionScolaire: (req.body.divisionScolaire || '').trim() || null,
    anneeScolaire: (req.body.anneeScolaire || '').trim() || null,
    titre: req.body.titre || null,
    laipvpAcknowledged: !!req.body.laipvpAcknowledged,
  })
  // Rattache au tout premier compte enseignant les élèves de démonstration
  // (seed(), voir server/db.js) créés avant qu'aucun compte n'existe — sans
  // ça, ils resteraient invisibles (teacher_id NULL) une fois le
  // cloisonnement par enseignant en place.
  db.prepare('UPDATE students SET teacher_id = ? WHERE teacher_id IS NULL').run(user.id)
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session' })
    req.session.userId = user.id
    req.session.username = user.username
    req.session.role = user.role
    req.session.isOwner = user.isOwner
    res.status(201).json({ username: user.username, role: user.role, profile: user })
  })
})

app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || '').trim()
  const password = req.body.password || ''
  const role = req.body.role

  const wait = isLockedOut(username)
  if (wait > 0) {
    return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} secondes.` })
  }

  const user = findUserByUsername(username)
  if (!user || !verifyPassword(password, user.password_hash)) {
    registerFailedAttempt(username)
    return res.status(401).json({ error: "Nom d'utilisateur ou mot de passe incorrect." })
  }
  if (role && user.role !== role) {
    registerFailedAttempt(username)
    const roleLabel = user.role === 'enseignant' ? 'enseignant' : 'EA'
    return res.status(401).json({ error: `Ce compte est enregistré comme ${roleLabel}, pas comme ${role === 'enseignant' ? 'enseignant' : 'EA'}.` })
  }

  clearFailedAttempts(username)
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session' })
    req.session.userId = user.id
    req.session.username = user.username
    req.session.role = user.role
    req.session.isOwner = !!user.is_owner
    res.json({ username: user.username, role: user.role })
  })
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('pei_central_sid')
    res.status(204).end()
  })
})

// Ces deux routes sont sous /api/auth/* : le garde-fou global plus bas les
// laisse passer sans vérification, donc la protection est posée ici directement.

app.get('/api/auth/accounts', requireRole('enseignant'), (req, res) => {
  res.json(listAccounts())
})

// Réservé au compte propriétaire (requireOwner) : un compte enseignant
// collaborateur (ex. enseignant-ressource assigné à une classe) garde tous
// ses droits sur les PEI auxquels il a accès, mais pas sur la création
// d'autres comptes — voir le complément "Compte propriétaire" du plan.
app.post('/api/auth/create-ea', requireOwner, (req, res) => {
  const username = (req.body.username || '').trim()
  const password = req.body.password || ''
  if (username.length < 3) {
    return res.status(400).json({ error: "Le nom d'utilisateur doit contenir au moins 3 caractères." })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' })
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' })
  }
  // L'EA est automatiquement rattaché à qui le crée (users.teacher_id) : dans
  // une base partagée, il ne doit voir que les élèves de ce compte enseignant,
  // pas ceux de toute l'école. Aucun champ à choisir dans le formulaire.
  const user = createAccount(username, password, 'ea', { teacherId: req.session.userId })
  res.status(201).json({ username: user.username, role: user.role })
})

// Second compte "enseignant" (droits complets sur les PEI auxquels il a
// accès), pour un enseignant-ressource ou tout autre collaborateur. Réservé
// au compte propriétaire, comme create-ea ci-dessus.
app.post('/api/auth/create-enseignant', requireOwner, (req, res) => {
  const username = (req.body.username || '').trim()
  const password = req.body.password || ''
  const nomComplet = (req.body.nomComplet || '').trim()
  if (username.length < 3) {
    return res.status(400).json({ error: "Le nom d'utilisateur doit contenir au moins 3 caractères." })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' })
  }
  if (!nomComplet) {
    return res.status(400).json({ error: 'Le nom complet est requis.' })
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' })
  }
  if (req.body.titre !== undefined && req.body.titre !== '' && !TEACHER_TITLES.includes(req.body.titre)) {
    return res.status(400).json({ error: 'Titre invalide.' })
  }
  const user = createAccount(username, password, 'enseignant', { nomComplet, titre: req.body.titre || null })
  res.status(201).json({ username: user.username, role: user.role })
})

// Assignations enseignant-ressource : qui peut consulter/modifier les élèves
// de qui (teacher_assignments). Lecture ouverte à tout compte enseignant
// (utile pour voir qui a accès à ses propres élèves) ; écriture réservée au
// propriétaire.
app.get('/api/auth/assignments', requireRole('enseignant'), (req, res) => {
  res.json(listAssignments())
})

app.post('/api/auth/assignments', requireOwner, (req, res) => {
  const resourceUsername = (req.body.resourceUsername || '').trim()
  const ownerUsername = (req.body.ownerUsername || '').trim()
  if (!resourceUsername || !ownerUsername) {
    return res.status(400).json({ error: 'Les deux comptes sont requis.' })
  }
  if (resourceUsername === ownerUsername) {
    return res.status(400).json({ error: 'Un compte ne peut pas être assigné à lui-même.' })
  }
  const resourceUser = findUserByUsername(resourceUsername)
  const ownerUser = findUserByUsername(ownerUsername)
  if (!resourceUser || resourceUser.role !== 'enseignant') {
    return res.status(400).json({ error: 'Compte collaborateur introuvable ou invalide.' })
  }
  if (!ownerUser || ownerUser.role !== 'enseignant') {
    return res.status(400).json({ error: 'Compte propriétaire de classe introuvable ou invalide.' })
  }
  try {
    const assignment = createAssignment(resourceUser.id, ownerUser.id)
    res.status(201).json(assignment)
  } catch {
    res.status(409).json({ error: 'Cette assignation existe déjà.' })
  }
})

app.delete('/api/auth/assignments/:id', requireOwner, (req, res) => {
  if (!deleteAssignment(req.params.id)) return notFound(res, 'Assignation')
  res.status(204).end()
})

app.get('/api/auth/profile', requireRole('enseignant'), (req, res) => {
  res.json(getUserProfile(req.session.userId))
})

app.patch('/api/auth/profile', requireRole('enseignant'), (req, res) => {
  if (req.body.titre !== undefined && req.body.titre !== '' && !TEACHER_TITLES.includes(req.body.titre)) {
    return res.status(400).json({ error: 'Titre invalide.' })
  }
  if (req.body.courriel !== undefined && req.body.courriel !== '' && !EMAIL_RE.test(req.body.courriel)) {
    return res.status(400).json({ error: 'Courriel invalide.' })
  }
  const updated = updateProfile(req.session.userId, {
    nomComplet: req.body.nomComplet,
    courriel: req.body.courriel,
    ecole: req.body.ecole,
    divisionScolaire: req.body.divisionScolaire,
    anneeScolaire: req.body.anneeScolaire,
    titre: req.body.titre,
  })
  res.json(updated)
})

// ---------- Réseau local ----------
// Désactivé par défaut : le serveur n'écoute que sur 127.0.0.1 (voir start()
// plus bas). Permet à un collègue sur le même réseau Wi-Fi de l'école
// (ex. un enseignant-ressource travaillant en collaboration) d'ouvrir
// l'application dans un navigateur sans rien installer. Le changement ne
// prend effet qu'au prochain démarrage de l'application (le port d'écoute
// ne peut pas être rouvert sur une autre interface sans redémarrer). Réservé
// au compte propriétaire (requireOwner), comme la gestion des comptes.
app.get('/api/network-settings', requireOwner, (req, res) => {
  res.json({
    lanSharingEnabled: isLanSharingEnabled(),
    lanAddresses: getLanAddresses(),
    port: DEFAULT_PORT,
  })
})

app.post('/api/network-settings', requireOwner, (req, res) => {
  setLanSharingEnabled(!!req.body.lanSharingEnabled)
  res.json({
    lanSharingEnabled: isLanSharingEnabled(),
    lanAddresses: getLanAddresses(),
    port: DEFAULT_PORT,
  })
})

// Toutes les routes /api/* suivantes exigent une session active, sauf /api/auth/*.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth')) return next()
  if (!req.path.startsWith('/api/')) return next()
  return requireAuth(req, res, next)
})

// ---------- Students ----------

app.get('/api/students', (req, res) => {
  const { placeholders, ids } = accessFilter(req)
  const rows = db.prepare(`SELECT * FROM students WHERE teacher_id IN (${placeholders}) ORDER BY rowid ASC`).all(...ids)
  res.json(rows.map(toStudentDTO))
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// N'utilise pas toISOString() : ça convertit en UTC et peut décaler la date
// d'un jour en soirée pour un fuseau horaire à l'ouest de l'UTC (ex. Manitoba).
function defaultNextReviewDate() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// La date de naissance est optionnelle : chaîne vide ou absente -> null
// (âge inconnu, onglet "Plan de transition" masqué), sinon doit être une date valide.
function parseBirthdate(value) {
  if (value === undefined || value === '') return { ok: true, value: null }
  if (!DATE_RE.test(value)) return { ok: false }
  return { ok: true, value }
}

app.post('/api/students', requireRole('enseignant'), (req, res) => {
  const { name, grade, nextReviewDate, birthdate } = req.body
  if (!name || !name.trim() || !grade || !grade.trim()) {
    return res.status(400).json({ error: "Le nom et le niveau sont requis" })
  }
  if (nextReviewDate !== undefined && !DATE_RE.test(nextReviewDate)) {
    return res.status(400).json({ error: 'Date de révision invalide.' })
  }
  const birthdateResult = parseBirthdate(birthdate)
  if (!birthdateResult.ok) {
    return res.status(400).json({ error: 'Date de naissance invalide.' })
  }
  const id = randomUUID()
  db.prepare(
    'INSERT INTO students (id, name, grade, next_review_date, birthdate, teacher_id, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(
    id,
    name.trim(),
    grade.trim(),
    DATE_RE.test(nextReviewDate) ? nextReviewDate : defaultNextReviewDate(),
    birthdateResult.value,
    req.session.userId,
    req.session.userId
  )
  res.status(201).json(toStudentDTO(getStudentRow.get(id)))
})

app.patch('/api/students/:id', requireRole('enseignant'), (req, res) => {
  const existing = getAccessibleStudent(req, req.params.id)
  if (!existing) return notFound(res, 'Élève')

  const name = req.body.name !== undefined ? req.body.name.trim() : existing.name
  const grade = req.body.grade !== undefined ? req.body.grade.trim() : existing.grade

  if (req.body.nextReviewDate !== undefined && !DATE_RE.test(req.body.nextReviewDate)) {
    return res.status(400).json({ error: 'Date de révision invalide.' })
  }
  const nextReviewDate = DATE_RE.test(req.body.nextReviewDate) ? req.body.nextReviewDate : existing.next_review_date

  let birthdate = existing.birthdate
  if (req.body.birthdate !== undefined) {
    const birthdateResult = parseBirthdate(req.body.birthdate)
    if (!birthdateResult.ok) {
      return res.status(400).json({ error: 'Date de naissance invalide.' })
    }
    birthdate = birthdateResult.value
  }

  const forces =
    req.body.forces !== undefined
      ? (typeof req.body.forces === 'string' && req.body.forces.trim() ? req.body.forces.trim() : null)
      : existing.forces
  const besoins =
    req.body.besoins !== undefined
      ? (typeof req.body.besoins === 'string' && req.body.besoins.trim() ? req.body.besoins.trim() : null)
      : existing.besoins

  if (req.body.consultationDate !== undefined && !DATE_RE.test(req.body.consultationDate) && req.body.consultationDate !== '') {
    return res.status(400).json({ error: 'Date de consultation invalide.' })
  }
  const consultationDate =
    req.body.consultationDate !== undefined
      ? (DATE_RE.test(req.body.consultationDate) ? req.body.consultationDate : null)
      : existing.consultation_date

  const consultationMethod =
    req.body.consultationMethod !== undefined
      ? (typeof req.body.consultationMethod === 'string' && req.body.consultationMethod.trim() ? req.body.consultationMethod.trim() : null)
      : existing.consultation_method

  if (req.body.copyDeliveryDate !== undefined && !DATE_RE.test(req.body.copyDeliveryDate) && req.body.copyDeliveryDate !== '') {
    return res.status(400).json({ error: 'Date de remise de copie invalide.' })
  }
  const copyDeliveryDate =
    req.body.copyDeliveryDate !== undefined
      ? (DATE_RE.test(req.body.copyDeliveryDate) ? req.body.copyDeliveryDate : null)
      : existing.copy_delivery_date

  if (req.body.acknowledgmentStatus !== undefined && req.body.acknowledgmentStatus !== '' && !ACKNOWLEDGMENT_STATUSES.includes(req.body.acknowledgmentStatus)) {
    return res.status(400).json({ error: "Statut d'accusé de réception invalide." })
  }
  const acknowledgmentStatus =
    req.body.acknowledgmentStatus !== undefined
      ? (ACKNOWLEDGMENT_STATUSES.includes(req.body.acknowledgmentStatus) ? req.body.acknowledgmentStatus : null)
      : existing.acknowledgment_status

  const applicableTransition =
    req.body.applicableTransition !== undefined ? (req.body.applicableTransition ? 1 : 0) : existing.applicable_transition

  // Version du rapport associee a la remise de copie (spec historique, point
  // 3) : repond a "quelle version le parent a-t-il recue ?". Doit appartenir
  // a cet eleve. Effacee automatiquement si la date de remise est retiree.
  let deliveredVersionId = existing.delivered_version_id
  if (req.body.deliveredVersionId !== undefined) {
    if (req.body.deliveredVersionId === null || req.body.deliveredVersionId === '') {
      deliveredVersionId = null
    } else {
      const versionRow = db
        .prepare('SELECT id FROM report_versions WHERE id = ? AND student_id = ?')
        .get(req.body.deliveredVersionId, req.params.id)
      if (!versionRow) {
        return res.status(400).json({ error: 'Version de rapport invalide.' })
      }
      deliveredVersionId = versionRow.id
    }
  }
  if (!copyDeliveryDate) {
    deliveredVersionId = null
  }

  if (!name || !grade) {
    return res.status(400).json({ error: "Le nom et le niveau sont requis" })
  }

  db.prepare(
    `UPDATE students SET name = ?, grade = ?, next_review_date = ?, birthdate = ?, forces = ?, besoins = ?,
     consultation_date = ?, consultation_method = ?, copy_delivery_date = ?, acknowledgment_status = ?,
     applicable_transition = ?, delivered_version_id = ?, modified_by = ?, modified_at = datetime('now') WHERE id = ?`
  ).run(
    name,
    grade,
    nextReviewDate,
    birthdate,
    forces,
    besoins,
    consultationDate,
    consultationMethod,
    copyDeliveryDate,
    acknowledgmentStatus,
    applicableTransition,
    deliveredVersionId,
    req.session.userId,
    req.params.id
  )
  res.json(toStudentDTO(getStudentRow.get(req.params.id)))
})

app.delete('/api/students/:id', requireRole('enseignant'), (req, res) => {
  const existing = getAccessibleStudent(req, req.params.id)
  if (!existing) return notFound(res, 'Élève')
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ---------- Goals ----------

app.post('/api/students/:id/goals', requireRole('enseignant'), (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')

  const label = (req.body.label || '').trim()
  if (!label) return res.status(400).json({ error: "L'objectif ne peut pas être vide" })

  const id = randomUUID()
  const position = getGoalsForStudent.all(req.params.id).length
  db.prepare(
    "INSERT INTO goals (id, student_id, label, status, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, req.params.id, label, 'non_atteint', position, req.session.userId)
  insertGoalStatusHistory.run(id, 'non_atteint', req.session.userId)
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id)
  res.status(201).json(toGoalDTO(goal))
})

// Modifier le texte ou le niveau de satisfaction d'un objectif est réservé à
// l'enseignant. Le suivi quotidien de l'EA se fait via les notes, pas via cet
// objectif directement (l'ancienne case à cocher "done", redondante avec le
// niveau de satisfaction, a été retirée).
app.patch('/api/goals/:goalId', requireRole('enseignant'), (req, res) => {
  const goal = getAccessibleGoal(req, req.params.goalId)
  if (!goal) return notFound(res, 'Objectif')

  const label = req.body.label !== undefined ? req.body.label.trim() : goal.label
  if (!label) return res.status(400).json({ error: "L'objectif ne peut pas être vide" })

  let status = goal.status
  if (req.body.status !== undefined) {
    if (!GOAL_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Niveau de satisfaction invalide.' })
    }
    status = req.body.status
  }

  db.prepare("UPDATE goals SET label = ?, status = ?, modified_by = ?, modified_at = datetime('now') WHERE id = ?").run(
    label,
    status,
    req.session.userId,
    req.params.goalId
  )

  if (status !== goal.status) {
    insertGoalStatusHistory.run(req.params.goalId, status, req.session.userId)
  }

  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.goalId)
  res.json(toGoalDTO(updated))
})

app.delete('/api/goals/:goalId', requireRole('enseignant'), (req, res) => {
  const goal = getAccessibleGoal(req, req.params.goalId)
  if (!goal) return notFound(res, 'Objectif')
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.goalId)
  res.status(204).end()
})

// ---------- Stratégies pédagogiques ----------
// La bibliothèque de suggestions est consultée par les deux rôles (utile pour
// l'EA au quotidien) ; seul l'enseignant peut associer/retirer une stratégie
// d'un objectif, au même titre que le texte et le niveau de l'objectif.

app.get('/api/strategies-library', (req, res) => {
  res.json(db.prepare('SELECT id, label, category FROM strategies_library ORDER BY category ASC, label ASC').all())
})

app.get('/api/adaptations-library', (req, res) => {
  res.json(db.prepare('SELECT id, label, subtype FROM adaptations_library ORDER BY subtype ASC, label ASC').all())
})

app.get('/api/forces-besoins-library', (req, res) => {
  res.json(db.prepare('SELECT id, label, field FROM forces_besoins_library ORDER BY field ASC, label ASC').all())
})

app.post('/api/goals/:goalId/strategies', requireRole('enseignant'), (req, res) => {
  const goal = getAccessibleGoal(req, req.params.goalId)
  if (!goal) return notFound(res, 'Objectif')

  const label = (req.body.label || '').trim()
  if (!label) return res.status(400).json({ error: 'La stratégie ne peut pas être vide' })

  const category = STRATEGY_CATEGORIES.includes(req.body.category) ? req.body.category : null

  const id = randomUUID()
  const position = getStrategiesForGoal.all(req.params.goalId).length
  db.prepare('INSERT INTO goal_strategies (id, goal_id, label, category, position) VALUES (?, ?, ?, ?, ?)').run(
    id,
    req.params.goalId,
    label,
    category,
    position
  )
  res.status(201).json({ id, label, category })
})

app.delete('/api/strategies/:strategyId', requireRole('enseignant'), (req, res) => {
  const strategy = getAccessibleStrategy(req, req.params.strategyId)
  if (!strategy) return notFound(res, 'Stratégie')
  db.prepare('DELETE FROM goal_strategies WHERE id = ?').run(req.params.strategyId)
  res.status(204).end()
})

// ---------- Adaptations / Modifications ----------
// Catégories légalement distinctes des "stratégies pédagogiques" ci-dessus :
// une adaptation change la façon d'enseigner/évaluer, une modification change
// le programme/les attentes. Réservé à l'enseignant comme le reste du profil.

app.post('/api/students/:id/adaptations', requireRole('enseignant'), (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')

  const description = (req.body.description || '').trim()
  if (!description) return res.status(400).json({ error: "La description ne peut pas être vide" })
  if (!ADAPTATION_SUBTYPES.includes(req.body.subtype)) {
    return res.status(400).json({ error: 'Sous-type invalide.' })
  }

  let goalId = null
  if (req.body.goalId) {
    const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND student_id = ?').get(req.body.goalId, req.params.id)
    if (!goal) return res.status(400).json({ error: "Objectif introuvable pour cet élève." })
    goalId = goal.id
  }

  const id = randomUUID()
  const position = getAdaptationsForStudent.all(req.params.id).length
  db.prepare(
    "INSERT INTO adaptations (id, student_id, goal_id, subtype, description, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, req.params.id, goalId, req.body.subtype, description, position, req.session.userId)

  res.status(201).json(withModifiedBy(getAdaptationsForStudent.all(req.params.id).find((a) => a.id === id)))
})

app.delete('/api/adaptations/:adaptationId', requireRole('enseignant'), (req, res) => {
  const adaptation = getAccessibleAdaptation(req, req.params.adaptationId)
  if (!adaptation) return notFound(res, 'Adaptation')
  db.prepare('DELETE FROM adaptations WHERE id = ?').run(req.params.adaptationId)
  res.status(204).end()
})

app.post('/api/students/:id/modifications', requireRole('enseignant'), (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')

  const description = (req.body.description || '').trim()
  const subject = (req.body.subject || '').trim()
  if (!description) return res.status(400).json({ error: "La description ne peut pas être vide" })
  if (!subject) return res.status(400).json({ error: 'La matière concernée est requise.' })
  if (!MODIFICATION_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: 'Type invalide.' })
  }

  const id = randomUUID()
  const position = getModificationsForStudent.all(req.params.id).length
  db.prepare(
    "INSERT INTO modifications (id, student_id, type, subject, description, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, req.params.id, req.body.type, subject, description, position, req.session.userId)

  res.status(201).json(withModifiedBy(getModificationsForStudent.all(req.params.id).find((m) => m.id === id)))
})

app.delete('/api/modifications/:modificationId', requireRole('enseignant'), (req, res) => {
  const modification = getAccessibleModification(req, req.params.modificationId)
  if (!modification) return notFound(res, 'Modification')
  db.prepare('DELETE FROM modifications WHERE id = ?').run(req.params.modificationId)
  res.status(204).end()
})

// ---------- Plan de transition ----------
// Réservé aux élèves de 14 ans et plus (ou marqués applicables manuellement,
// voir applicable_transition) — l'onglet lui-même est masqué côté client selon
// ce critère, mais on ne le revalide pas ici : un enseignant qui a coché la
// case ou dont les données d'âge ont changé entre-temps reste libre d'agir.

app.post('/api/students/:id/transition-goals', requireRole('enseignant'), (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')

  const description = (req.body.description || '').trim()
  if (!description) return res.status(400).json({ error: "L'objectif ne peut pas être vide" })

  if (req.body.targetDate !== undefined && req.body.targetDate !== '' && !DATE_RE.test(req.body.targetDate)) {
    return res.status(400).json({ error: 'Délai prévu invalide.' })
  }
  const targetDate = DATE_RE.test(req.body.targetDate) ? req.body.targetDate : null
  const responsible = typeof req.body.responsible === 'string' && req.body.responsible.trim() ? req.body.responsible.trim() : null
  const communityResources =
    typeof req.body.communityResources === 'string' && req.body.communityResources.trim()
      ? req.body.communityResources.trim()
      : null

  const id = randomUUID()
  const position = getTransitionGoalsForStudent.all(req.params.id).length
  db.prepare(
    `INSERT INTO transition_goals (id, student_id, description, responsible, target_date, community_resources, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.params.id, description, responsible, targetDate, communityResources, position)

  res.status(201).json(toTransitionGoalDTO(getTransitionGoalsForStudent.all(req.params.id).find((g) => g.id === id)))
})

app.delete('/api/transition-goals/:goalId', requireRole('enseignant'), (req, res) => {
  const goal = getAccessibleTransitionGoal(req, req.params.goalId)
  if (!goal) return notFound(res, 'Objectif de transition')
  db.prepare('DELETE FROM transition_goals WHERE id = ?').run(req.params.goalId)
  res.status(204).end()
})

app.post('/api/transition-goals/:goalId/steps', requireRole('enseignant'), (req, res) => {
  const goal = getAccessibleTransitionGoal(req, req.params.goalId)
  if (!goal) return notFound(res, 'Objectif de transition')

  const description = (req.body.description || '').trim()
  if (!description) return res.status(400).json({ error: "L'étape ne peut pas être vide" })

  const id = randomUUID()
  const position = getTransitionStepsForGoal.all(req.params.goalId).length
  db.prepare('INSERT INTO transition_steps (id, transition_goal_id, description, position) VALUES (?, ?, ?, ?)').run(
    id,
    req.params.goalId,
    description,
    position
  )
  res.status(201).json({ id, description })
})

app.delete('/api/transition-steps/:stepId', requireRole('enseignant'), (req, res) => {
  const step = getAccessibleTransitionStep(req, req.params.stepId)
  if (!step) return notFound(res, 'Étape')
  db.prepare('DELETE FROM transition_steps WHERE id = ?').run(req.params.stepId)
  res.status(204).end()
})

// ---------- Notes ----------
// Ouvert à l'enseignant et à l'EA : le suivi quotidien (notes + objectifs
// cochés) est le cœur du travail de l'EA auprès des élèves.

app.post('/api/students/:id/notes', requireRole('enseignant', 'ea'), (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')

  const text = (req.body.text || '').trim()
  if (!text) return res.status(400).json({ error: 'La note ne peut pas être vide' })

  const date = new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })
  const result = db
    .prepare('INSERT INTO notes (student_id, date, text) VALUES (?, ?, ?)')
    .run(req.params.id, date, text)
  res.status(201).json({ id: result.lastInsertRowid, date, text })
})

// ---------- Export PDF ----------
// Ouvert aux deux rôles, au même titre que le bouton "Générer un rapport"
// dans l'interface (lecture seule, aucune donnée n'est modifiée). L'école et
// la division scolaire viennent du compte enseignant (il n'y en a qu'un par
// installation) peu importe quel rôle génère le rapport.

function reportHeaderOptions(req) {
  // École/division viennent du premier compte enseignant (information
  // partagée par toute l'école, peu importe qui génère le rapport). En
  // revanche "généré par" doit refléter la personne réellement connectée,
  // pas toujours le tout premier compte créé — plusieurs comptes enseignant
  // (ex. enseignant titulaire + enseignant-ressource) peuvent coexister.
  const teacher = getTeacherProfile()
  const currentUser = getUserProfile(req.session.userId)
  return {
    ecole: teacher?.ecole || null,
    divisionScolaire: teacher?.divisionScolaire || null,
    generatedBy: currentUser?.nomComplet || req.session.username || null,
    lang: req.query.lang === 'en' ? 'en' : 'fr',
  }
}

function recordReportVersion(dto, req) {
  const exportedBy = reportHeaderOptions(req).generatedBy
  insertReportVersion.run(dto.id, exportedBy, JSON.stringify(dto))
}

app.get('/api/students/:id/report.pdf', (req, res) => {
  const row = getAccessibleStudent(req, req.params.id)
  if (!row) return notFound(res, 'Élève')
  const dto = toStudentDTO(row)
  recordReportVersion(dto, req)
  streamStudentReportPdf(res, dto, reportHeaderOptions(req))
})

app.get('/api/reports/pdf', (req, res) => {
  const { placeholders, ids } = accessFilter(req)
  const rows = db.prepare(`SELECT * FROM students WHERE teacher_id IN (${placeholders}) ORDER BY rowid ASC`).all(...ids)
  if (rows.length === 0) {
    return res.status(400).json({ error: 'Aucun élève à exporter.' })
  }
  const dtos = rows.map(toStudentDTO)
  for (const dto of dtos) recordReportVersion(dto, req)
  streamCombinedReportPdf(res, dtos, reportHeaderOptions(req))
})

// Historique des versions : ouvert aux deux rôles comme l'export lui-même
// (lecture seule). La liste ne renvoie pas le contenu complet (potentiellement
// volumineux) ; il faut demander une version précise pour la consulter.
app.get('/api/students/:id/report-versions', (req, res) => {
  const student = getAccessibleStudent(req, req.params.id)
  if (!student) return notFound(res, 'Élève')
  const rows = db
    .prepare('SELECT id, exported_at AS exportedAt, exported_by AS exportedBy FROM report_versions WHERE student_id = ? ORDER BY exported_at DESC, id DESC')
    .all(req.params.id)
  res.json(rows)
})

app.get('/api/report-versions/:versionId', (req, res) => {
  const row = getAccessibleReportVersion(req, req.params.versionId)
  if (!row) return notFound(res, 'Version de rapport')
  res.json({
    id: row.id,
    studentId: row.student_id,
    exportedAt: row.exported_at,
    exportedBy: row.exported_by,
    snapshot: JSON.parse(row.content_snapshot),
  })
})

// ---------- Rédaction de rapport par IA ----------
// Les clés API (une par fournisseur : Claude, Mistral) sont stockées dans des
// fichiers locaux (server/aiConfig.js), jamais dans la base ni renvoyées au
// client. Seul l'enseignant peut générer et enregistrer un résumé narratif :
// c'est lui qui garde le contrôle final avant toute publication, conformément
// à la spec. Le journal d'audit ne conserve que qui/quand/pour-quel-élève,
// jamais le prompt ni le texte généré.

app.get('/api/ai/status', requireRole('enseignant'), (req, res) => {
  const providers = {}
  for (const provider of AI_PROVIDERS) {
    providers[provider] = { label: AI_PROVIDER_LABELS[provider], configured: hasApiKey(provider) }
  }
  res.json({ activeProvider: getActiveProvider(), providers })
})

app.post('/api/ai/active-provider', requireRole('enseignant'), (req, res) => {
  if (!AI_PROVIDERS.includes(req.body.provider)) {
    return res.status(400).json({ error: 'Fournisseur invalide.' })
  }
  setActiveProvider(req.body.provider)
  res.status(204).end()
})

app.post('/api/ai/providers/:provider/key', requireRole('enseignant'), (req, res) => {
  const { provider } = req.params
  if (!AI_PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Fournisseur invalide.' })
  const apiKey = (req.body.apiKey || '').trim()
  if (!apiKey) return res.status(400).json({ error: 'La clé API ne peut pas être vide.' })
  setApiKey(provider, apiKey)
  res.json({ configured: true })
})

app.delete('/api/ai/providers/:provider/key', requireRole('enseignant'), (req, res) => {
  const { provider } = req.params
  if (!AI_PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Fournisseur invalide.' })
  clearApiKey(provider)
  res.status(204).end()
})

const insertAiGenerationLog = db.prepare(
  'INSERT INTO ai_generation_log (student_id, generated_by) VALUES (?, ?)'
)

app.post('/api/students/:id/ai-report', requireRole('enseignant'), async (req, res) => {
  const row = getAccessibleStudent(req, req.params.id)
  if (!row) return notFound(res, 'Élève')

  try {
    const lang = req.body.lang === 'en' ? 'en' : 'fr'
    const draft = await generateNarrativeReport(toStudentDTO(row), lang)
    insertAiGenerationLog.run(req.params.id, req.session.username || null)
    res.json({ draft })
  } catch (e) {
    const status = e.code === 'NO_API_KEY' ? 400 : 502
    res.status(status).json({ error: e.message || 'La génération du rapport a échoué.' })
  }
})

app.post('/api/students/:id/suggest-text', requireRole('enseignant'), async (req, res) => {
  const row = getAccessibleStudent(req, req.params.id)
  if (!row) return notFound(res, 'Élève')

  const field = req.body.field
  if (field !== 'forces' && field !== 'besoins') {
    return res.status(400).json({ error: 'Champ invalide.' })
  }
  const draft = typeof req.body.draft === 'string' ? req.body.draft : ''
  const lang = req.body.lang === 'en' ? 'en' : 'fr'

  try {
    const suggestion = await suggestFieldText(toStudentDTO(row), field, draft, lang)
    insertAiGenerationLog.run(req.params.id, req.session.username || null)
    res.json({ suggestion })
  } catch (e) {
    const status = e.code === 'NO_API_KEY' ? 400 : 502
    res.status(status).json({ error: e.message || 'La suggestion a échoué.' })
  }
})

app.patch('/api/students/:id/narrative-report', requireRole('enseignant'), (req, res) => {
  const row = getAccessibleStudent(req, req.params.id)
  if (!row) return notFound(res, 'Élève')

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
  db.prepare(
    "UPDATE students SET narrative_report = ?, narrative_report_updated_at = CASE WHEN ? = '' THEN NULL ELSE datetime('now') END WHERE id = ?"
  ).run(text || null, text, req.params.id)

  res.json(toStudentDTO(getStudentRow.get(req.params.id)))
})

// ---------- Import PEI (PDF / Word) ----------
// Cette route ne fait qu'extraire et proposer des valeurs ; rien n'est écrit
// dans la base ici. L'ajout réel passe par les routes /api/students et
// /api/students/:id/goals, appelées uniquement après validation par l'enseignant.

app.post('/api/import/extract', requireRole('enseignant'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Le fichier dépasse la taille maximale de 15 Mo.' : err.message
      return res.status(400).json({ error: message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier reçu' })
    }

    try {
      const text = await extractText(req.file.buffer, req.file.originalname)
      if (!text.trim()) {
        return res.json({
          text: '',
          guess: { name: '', grade: '', goals: [] },
          warning: "Aucun texte n'a pu être extrait de ce fichier (document scanné sans OCR ?). Remplissez les champs manuellement.",
        })
      }
      const guess = guessFields(text)
      res.json({ text, guess })
    } catch (e) {
      res.status(400).json({ error: e.message || "Impossible de lire ce fichier" })
    }
  })
})

// ---------- Sauvegarde / restauration ----------
// Réservé à l'enseignant. Ne couvre que les données des élèves (élèves,
// objectifs, taux hebdomadaires, notes) — jamais les comptes/mots de passe,
// pour éviter qu'un fichier de sauvegarde téléchargé contienne des hachages
// et pour ne jamais risquer de verrouiller l'enseignant hors de son compte.

app.get('/api/backup/export', requireRole('enseignant'), (req, res) => {
  const { placeholders, ids } = accessFilter(req)
  const rows = db.prepare(`SELECT * FROM students WHERE teacher_id IN (${placeholders}) ORDER BY rowid ASC`).all(...ids)
  const backup = {
    app: 'pei-central',
    version: 1,
    exportedAt: new Date().toISOString(),
    students: rows.map((row) => ({
      name: row.name,
      grade: row.grade,
      nextReviewDate: row.next_review_date,
      birthdate: row.birthdate,
      forces: row.forces,
      besoins: row.besoins,
      consultationDate: row.consultation_date,
      consultationMethod: row.consultation_method,
      copyDeliveryDate: row.copy_delivery_date,
      acknowledgmentStatus: row.acknowledgment_status,
      applicableTransition: !!row.applicable_transition,
      transitionGoals: getTransitionGoalsForStudent.all(row.id).map((g) => ({
        description: g.description,
        responsible: g.responsible,
        targetDate: g.targetDate,
        communityResources: g.communityResources,
        steps: getTransitionStepsForGoal.all(g.id).map(({ description }) => ({ description })),
      })),
      narrativeReport: row.narrative_report,
      goals: getGoalsForStudent.all(row.id).map((g) => ({
        label: g.label,
        status: g.status,
        strategies: getStrategiesForGoal.all(g.id).map(({ label, category }) => ({ label, category })),
      })),
      // Référence l'objectif par libellé plutôt que par id : les id sont
      // régénérés à la restauration, le libellé se reconstitue par correspondance.
      adaptations: getAdaptationsForStudent.all(row.id).map(({ subtype, description, goalLabel }) => ({
        subtype,
        description,
        goalLabel: goalLabel || null,
      })),
      modifications: getModificationsForStudent.all(row.id).map(({ type, subject, description }) => ({
        type,
        subject,
        description,
      })),
      weeklyRate: getWeeklyRateForStudent.all(row.id),
      notes: getNotesForStudent.all(row.id).map(({ date, text }) => ({ date, text })),
    })),
  }
  const filename = `pei-central-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'application/json')
  res.json(backup)
})

function validateBackup(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.students)) {
    return "Fichier de sauvegarde invalide : format non reconnu."
  }
  for (const s of data.students) {
    if (!s || typeof s.name !== 'string' || !s.name.trim() || typeof s.grade !== 'string' || !s.grade.trim()) {
      return 'Fichier de sauvegarde invalide : un élève est incomplet (nom ou niveau manquant).'
    }
  }
  return null
}

app.post('/api/backup/restore', requireRole('enseignant'), (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Le fichier dépasse la taille maximale autorisée.' : err.message
      return res.status(400).json({ error: message })
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

    let data
    try {
      data = JSON.parse(req.file.buffer.toString('utf8'))
    } catch {
      return res.status(400).json({ error: "Ce fichier n'est pas un JSON valide." })
    }

    const validationError = validateBackup(data)
    if (validationError) return res.status(400).json({ error: validationError })

    const insertStudent = db.prepare(
      `INSERT INTO students
       (id, name, grade, next_review_date, birthdate, forces, besoins,
        consultation_date, consultation_method, copy_delivery_date, acknowledgment_status, applicable_transition,
        narrative_report, narrative_report_updated_at, teacher_id, modified_by, modified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    const insertGoal = db.prepare(
      "INSERT INTO goals (id, student_id, label, status, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    const insertWeek = db.prepare('INSERT INTO weekly_rate (student_id, week, pct) VALUES (?, ?, ?)')
    const insertNote = db.prepare('INSERT INTO notes (student_id, date, text) VALUES (?, ?, ?)')
    const insertStrategy = db.prepare(
      'INSERT INTO goal_strategies (id, goal_id, label, category, position) VALUES (?, ?, ?, ?, ?)'
    )
    const insertAdaptation = db.prepare(
      "INSERT INTO adaptations (id, student_id, goal_id, subtype, description, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    const insertModification = db.prepare(
      "INSERT INTO modifications (id, student_id, type, subject, description, position, modified_by, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    const insertTransitionGoal = db.prepare(
      `INSERT INTO transition_goals (id, student_id, description, responsible, target_date, community_resources, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const insertTransitionStep = db.prepare(
      'INSERT INTO transition_steps (id, transition_goal_id, description, position) VALUES (?, ?, ?, ?)'
    )

    // Ne supprime que les élèves déjà accessibles à qui restaure — jamais
    // toute la table : dans une base partagée entre plusieurs comptes
    // enseignant, restaurer sa propre sauvegarde ne doit jamais effacer les
    // élèves d'un collègue.
    const { placeholders, ids } = accessFilter(req)

    const run = db.transaction(() => {
      db.prepare(`DELETE FROM students WHERE teacher_id IN (${placeholders})`).run(...ids) // cascade : vide aussi goals / weekly_rate / notes

      for (const s of data.students) {
        const studentId = randomUUID()
        // Compatibilité avec les anciennes sauvegardes (avant le rappel de
        // révision) qui stockaient un nombre de jours plutôt qu'une date.
        let nextReviewDate = DATE_RE.test(s.nextReviewDate) ? s.nextReviewDate : null
        if (!nextReviewDate) {
          const fallbackDays = Number.isFinite(s.reviewInDays) ? s.reviewInDays : 30
          const d = new Date()
          d.setDate(d.getDate() + fallbackDays)
          nextReviewDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        const narrativeReport = typeof s.narrativeReport === 'string' && s.narrativeReport.trim() ? s.narrativeReport.trim() : null
        const birthdate = DATE_RE.test(s.birthdate) ? s.birthdate : null
        const forces = typeof s.forces === 'string' && s.forces.trim() ? s.forces.trim() : null
        const besoins = typeof s.besoins === 'string' && s.besoins.trim() ? s.besoins.trim() : null
        const consultationDate = DATE_RE.test(s.consultationDate) ? s.consultationDate : null
        const consultationMethod = typeof s.consultationMethod === 'string' && s.consultationMethod.trim() ? s.consultationMethod.trim() : null
        const copyDeliveryDate = DATE_RE.test(s.copyDeliveryDate) ? s.copyDeliveryDate : null
        const acknowledgmentStatus = ACKNOWLEDGMENT_STATUSES.includes(s.acknowledgmentStatus) ? s.acknowledgmentStatus : null
        insertStudent.run(
          studentId,
          s.name.trim(),
          s.grade.trim(),
          nextReviewDate,
          birthdate,
          forces,
          besoins,
          consultationDate,
          consultationMethod,
          copyDeliveryDate,
          acknowledgmentStatus,
          s.applicableTransition ? 1 : 0,
          narrativeReport,
          narrativeReport ? new Date().toISOString() : null,
          req.session.userId,
          req.session.userId
        )

        const goalIdByLabel = new Map()
        ;(Array.isArray(s.goals) ? s.goals : []).forEach((g, i) => {
          if (!g || typeof g.label !== 'string' || !g.label.trim()) return
          const status = GOAL_STATUSES.includes(g.status) ? g.status : 'non_atteint'
          const goalId = randomUUID()
          // g.done (ancienne case a cocher retiree) est ignore s'il est present
          // dans une sauvegarde plus ancienne — compatibilite en lecture seule.
          insertGoal.run(goalId, studentId, g.label.trim(), status, i, req.session.userId)
          insertGoalStatusHistory.run(goalId, status, req.session.userId)
          goalIdByLabel.set(g.label.trim(), goalId)

          ;(Array.isArray(g.strategies) ? g.strategies : []).forEach((st, j) => {
            if (!st || typeof st.label !== 'string' || !st.label.trim()) return
            const category = STRATEGY_CATEGORIES.includes(st.category) ? st.category : null
            insertStrategy.run(randomUUID(), goalId, st.label.trim(), category, j)
          })
        })
        ;(Array.isArray(s.adaptations) ? s.adaptations : []).forEach((a, i) => {
          if (!a || typeof a.description !== 'string' || !a.description.trim()) return
          const subtype = ADAPTATION_SUBTYPES.includes(a.subtype) ? a.subtype : 'pedagogique'
          const goalId = typeof a.goalLabel === 'string' ? goalIdByLabel.get(a.goalLabel) || null : null
          insertAdaptation.run(randomUUID(), studentId, goalId, subtype, a.description.trim(), i, req.session.userId)
        })
        ;(Array.isArray(s.modifications) ? s.modifications : []).forEach((m, i) => {
          if (!m || typeof m.description !== 'string' || !m.description.trim()) return
          if (typeof m.subject !== 'string' || !m.subject.trim()) return
          const type = MODIFICATION_TYPES.includes(m.type) ? m.type : 'complexite_ajustee'
          insertModification.run(randomUUID(), studentId, type, m.subject.trim(), m.description.trim(), i, req.session.userId)
        })
        ;(Array.isArray(s.transitionGoals) ? s.transitionGoals : []).forEach((tg, i) => {
          if (!tg || typeof tg.description !== 'string' || !tg.description.trim()) return
          const responsible = typeof tg.responsible === 'string' && tg.responsible.trim() ? tg.responsible.trim() : null
          const targetDate = DATE_RE.test(tg.targetDate) ? tg.targetDate : null
          const communityResources =
            typeof tg.communityResources === 'string' && tg.communityResources.trim() ? tg.communityResources.trim() : null
          const transitionGoalId = randomUUID()
          insertTransitionGoal.run(transitionGoalId, studentId, tg.description.trim(), responsible, targetDate, communityResources, i)

          ;(Array.isArray(tg.steps) ? tg.steps : []).forEach((step, j) => {
            if (!step || typeof step.description !== 'string' || !step.description.trim()) return
            insertTransitionStep.run(randomUUID(), transitionGoalId, step.description.trim(), j)
          })
        })
        ;(Array.isArray(s.weeklyRate) ? s.weeklyRate : []).forEach((w) => {
          if (!w || typeof w.week !== 'string' || !Number.isFinite(w.pct)) return
          insertWeek.run(studentId, w.week, w.pct)
        })
        ;(Array.isArray(s.notes) ? s.notes : []).forEach((n) => {
          if (!n || typeof n.date !== 'string' || typeof n.text !== 'string' || !n.text.trim()) return
          insertNote.run(studentId, n.date, n.text.trim())
        })
      }
    })

    try {
      run()
    } catch (e) {
      return res.status(500).json({ error: 'Erreur lors de la restauration : ' + e.message })
    }

    res.json({ studentsRestored: data.students.length })
  })
})

// ---------- Frontend statique ----------
// Sert le build Vite (dist/) sur le même serveur/port que l'API : indispensable
// pour l'app Electron (une seule fenêtre, un seul port, pas de souci de cookie
// cross-origin) et pratique aussi pour un déploiement web simple.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')

app.use(express.static(distPath))

// Route de secours pour tout ce qui n'est ni une route /api/* ni un fichier
// statique existant : renvoie index.html (l'app est une SPA à état interne,
// il n'y a en pratique que "/" à servir ainsi).
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next(err)
  })
})

// ---------- Démarrage ----------

const DEFAULT_PORT = process.env.PORT || 3001

export function start(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    // Par défaut, n'écoute que sur cette machine (127.0.0.1) : sans ça, Node
    // écoute par défaut sur toutes les interfaces réseau, ce qui rend l'écran
    // de connexion joignable par n'importe qui sur le même réseau Wi-Fi, pas
    // seulement sur cet ordinateur. Le partage sur le réseau local (réglage
    // /api/network-settings, désactivé par défaut) ouvre volontairement cette
    // porte pour permettre l'accès depuis un autre appareil de l'école.
    const host = isLanSharingEnabled() ? '0.0.0.0' : '127.0.0.1'
    const server = app
      .listen(port, host, () => {
        console.log(`API Repère sur http://localhost:${port}${host === '0.0.0.0' ? ' (aussi accessible sur le reseau local)' : ''}`)
        resolve(server)
      })
      .on('error', reject)
  })
}

// Démarrage automatique seulement quand ce fichier est exécuté directement
// (npm run server / npm run dev). Quand Electron l'importe via start(), il
// garde la main sur le moment où le serveur démarre.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start()
}
