import bcrypt from 'bcrypt'
import { randomBytes, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { db, dataDir } from './db.js'

const secretPath = path.join(dataDir, 'session-secret.txt')

const SALT_ROUNDS = 12
export const SESSION_MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes d'inactivité

export function getSessionSecret() {
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf8').trim()
  }
  const secret = randomBytes(48).toString('hex')
  writeFileSync(secretPath, secret, 'utf8')
  return secret
}

export const ROLES = ['enseignant', 'ea']

export function hasTeacherAccount() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'enseignant'").get().n > 0
}

function toUserProfileDTO(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    nomComplet: row.nom_complet,
    courriel: row.courriel,
    ecole: row.ecole,
    divisionScolaire: row.division_scolaire,
    anneeScolaire: row.annee_scolaire,
    titre: row.titre,
    laipvpAcknowledged: !!row.laipvp_acknowledged,
    laipvpAcknowledgedAt: row.laipvp_acknowledged_at,
  }
}

export function createAccount(username, password, role, profile = {}) {
  if (!ROLES.includes(role)) throw new Error('Role invalide')
  const id = randomUUID()
  const hash = bcrypt.hashSync(password, SALT_ROUNDS)
  db.prepare(
    `INSERT INTO users
     (id, username, password_hash, role, nom_complet, courriel, ecole, division_scolaire, annee_scolaire, titre, laipvp_acknowledged, laipvp_acknowledged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    username,
    hash,
    role,
    profile.nomComplet || null,
    profile.courriel || null,
    profile.ecole || null,
    profile.divisionScolaire || null,
    profile.anneeScolaire || null,
    profile.titre || null,
    profile.laipvpAcknowledged ? 1 : 0,
    profile.laipvpAcknowledged ? new Date().toISOString() : null
  )
  return toUserProfileDTO(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}

export function getUserProfile(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  return row ? toUserProfileDTO(row) : null
}

// Il n'existe qu'un seul compte enseignant par installation (créé une fois à
// la configuration initiale) — utile pour l'en-tête du rapport PDF, qui doit
// afficher l'école/division peu importe quel rôle a généré le rapport.
export function getTeacherProfile() {
  const row = db.prepare("SELECT * FROM users WHERE role = 'enseignant' LIMIT 1").get()
  return row ? toUserProfileDTO(row) : null
}

export function updateProfile(userId, data) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!existing) throw new Error('Compte introuvable')

  const nomComplet = data.nomComplet !== undefined ? data.nomComplet || null : existing.nom_complet
  const courriel = data.courriel !== undefined ? data.courriel || null : existing.courriel
  const ecole = data.ecole !== undefined ? data.ecole || null : existing.ecole
  const divisionScolaire = data.divisionScolaire !== undefined ? data.divisionScolaire || null : existing.division_scolaire
  const anneeScolaire = data.anneeScolaire !== undefined ? data.anneeScolaire || null : existing.annee_scolaire
  const titre = data.titre !== undefined ? data.titre || null : existing.titre

  db.prepare(
    `UPDATE users SET nom_complet = ?, courriel = ?, ecole = ?, division_scolaire = ?, annee_scolaire = ?, titre = ? WHERE id = ?`
  ).run(nomComplet, courriel, ecole, divisionScolaire, anneeScolaire, titre, userId)

  return getUserProfile(userId)
}

export function listAccounts() {
  return db
    .prepare('SELECT username, role, nom_complet AS nomComplet, titre, created_at FROM users ORDER BY created_at ASC')
    .all()
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

// ---------- Protection contre les tentatives répétées ----------
// Compte simple, en mémoire : au-delà de 5 échecs, impose un délai croissant
// avant de réessayer. Suffisant pour un seul compte enseignant local.

const failedAttempts = new Map() // username -> { count, lockedUntil }

export function isLockedOut(username) {
  const entry = failedAttempts.get(username)
  if (!entry || !entry.lockedUntil) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

export function registerFailedAttempt(username) {
  const entry = failedAttempts.get(username) || { count: 0, lockedUntil: 0 }
  entry.count += 1
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 60_000 * Math.min(entry.count - 4, 10)
  }
  failedAttempts.set(username, entry)
}

export function clearFailedAttempts(username) {
  failedAttempts.delete(username)
}

// ---------- Middleware ----------

export function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next()
  return res.status(401).json({ error: 'Authentification requise' })
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Authentification requise' })
    }
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Action réservée au rôle enseignant.' })
    }
    return next()
  }
}
