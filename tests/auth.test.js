import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import {
  createAccount,
  findUserByUsername,
  hasTeacherAccount,
  verifyPassword,
  isLockedOut,
  registerFailedAttempt,
  clearFailedAttempts,
  listAccounts,
} from '../server/auth.js'

beforeEach(() => {
  db.exec('DELETE FROM users')
})

describe('createAccount / verifyPassword', () => {
  it('hache le mot de passe (jamais stocke en clair)', () => {
    createAccount('prof', 'test1234', 'enseignant')
    const user = findUserByUsername('prof')
    expect(user.password_hash).not.toBe('test1234')
    expect(user.password_hash).toMatch(/^\$2[aby]\$/)
  })

  it('verifyPassword accepte le bon mot de passe et rejette les autres', () => {
    createAccount('prof', 'test1234', 'enseignant')
    const user = findUserByUsername('prof')
    expect(verifyPassword('test1234', user.password_hash)).toBe(true)
    expect(verifyPassword('mauvais-mdp', user.password_hash)).toBe(false)
  })

  it('rejette un role invalide', () => {
    expect(() => createAccount('x', 'test1234', 'admin')).toThrow()
  })

  it('conserve le profil fourni (ecole, titre, etc.)', () => {
    const profile = createAccount('prof', 'test1234', 'enseignant', {
      nomComplet: 'Baudouin Mandan',
      ecole: 'École Rivière-Rouge',
      titre: 'enseignant_ressource',
    })
    expect(profile.nomComplet).toBe('Baudouin Mandan')
    expect(profile.ecole).toBe('École Rivière-Rouge')
    expect(profile.titre).toBe('enseignant_ressource')
  })
})

describe('hasTeacherAccount', () => {
  it('est faux tant qu aucun compte enseignant n existe', () => {
    expect(hasTeacherAccount()).toBe(false)
  })

  it('devient vrai des qu un compte enseignant est cree', () => {
    createAccount('prof', 'test1234', 'enseignant')
    expect(hasTeacherAccount()).toBe(true)
  })

  it('reste faux si seul un compte EA existe', () => {
    createAccount('assistant', 'test1234', 'ea')
    expect(hasTeacherAccount()).toBe(false)
  })
})

describe('listAccounts', () => {
  it('ne renvoie jamais le hash du mot de passe', () => {
    createAccount('prof', 'test1234', 'enseignant')
    const accounts = listAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).not.toHaveProperty('password_hash')
    expect(accounts[0].username).toBe('prof')
  })
})

describe('protection contre les tentatives repetees', () => {
  it('n est pas verrouille avant 5 echecs', () => {
    for (let i = 0; i < 4; i++) registerFailedAttempt('prof')
    expect(isLockedOut('prof')).toBe(0)
  })

  it('se verrouille a la 5e tentative echouee', () => {
    for (let i = 0; i < 5; i++) registerFailedAttempt('prof')
    expect(isLockedOut('prof')).toBeGreaterThan(0)
  })

  it('clearFailedAttempts leve le verrou', () => {
    for (let i = 0; i < 5; i++) registerFailedAttempt('prof')
    expect(isLockedOut('prof')).toBeGreaterThan(0)
    clearFailedAttempts('prof')
    expect(isLockedOut('prof')).toBe(0)
  })

  it('le verrou est propre a chaque nom d utilisateur', () => {
    for (let i = 0; i < 5; i++) registerFailedAttempt('prof-a')
    expect(isLockedOut('prof-a')).toBeGreaterThan(0)
    expect(isLockedOut('prof-b')).toBe(0)
  })
})
