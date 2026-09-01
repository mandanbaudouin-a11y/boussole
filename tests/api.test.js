import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { clearFailedAttempts } from '../server/auth.js'

let baseUrl
let server

beforeAll(async () => {
  server = await start(0) // port 0 = port libre choisi par l'OS
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  db.exec('DELETE FROM users')
  // Le compteur de tentatives echouees vit en memoire dans le processus du
  // serveur (partage entre les tests de ce fichier) et non dans la base :
  // le vider ici evite qu'un test de verrouillage n'en verrouille un autre.
  clearFailedAttempts('prof')
})

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie')
  return raw ? raw.split(';')[0] : null
}

async function setupTeacher(overrides = {}) {
  const res = await fetch(`${baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'prof',
      password: 'test1234',
      nomComplet: 'Baudouin Mandan',
      courriel: 'prof@ecole.ca',
      ...overrides,
    }),
  })
  return res
}

describe('GET /api/auth/status', () => {
  it('indique needsSetup tant qu aucun compte n existe', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.needsSetup).toBe(true)
    expect(body.authenticated).toBe(false)
  })
})

describe('POST /api/auth/setup', () => {
  it('cree le premier compte enseignant et ouvre une session', async () => {
    const res = await setupTeacher()
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.username).toBe('prof')
    expect(body.role).toBe('enseignant')
    expect(cookieFrom(res)).toBeTruthy()
  })

  it('refuse un second compte enseignant', async () => {
    await setupTeacher()
    const res = await setupTeacher({ username: 'prof2' })
    expect(res.status).toBe(409)
  })

  it('refuse un mot de passe trop court', async () => {
    const res = await setupTeacher({ password: 'court' })
    expect(res.status).toBe(400)
  })

  it('refuse un courriel invalide', async () => {
    const res = await setupTeacher({ courriel: 'pas-un-courriel' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await setupTeacher()
  })

  it('accepte le bon mot de passe et role', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'prof', password: 'test1234', role: 'enseignant' }),
    })
    expect(res.status).toBe(200)
    expect(cookieFrom(res)).toBeTruthy()
  })

  it('rejette un mauvais mot de passe', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'prof', password: 'mauvais', role: 'enseignant' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejette un role qui ne correspond pas au compte', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'prof', password: 'test1234', role: 'ea' }),
    })
    expect(res.status).toBe(401)
  })

  it('verrouille apres 5 echecs puis debloque une fois le compteur remis a zero', async () => {
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'prof', password: 'mauvais', role: 'enseignant' }),
      })
    }
    const locked = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'prof', password: 'test1234', role: 'enseignant' }),
    })
    expect(locked.status).toBe(429)
  })

  it('une session ouverte se reflete dans /api/auth/status', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'prof', password: 'test1234', role: 'enseignant' }),
    })
    const cookie = cookieFrom(loginRes)
    const statusRes = await fetch(`${baseUrl}/api/auth/status`, { headers: { Cookie: cookie } })
    const body = await statusRes.json()
    expect(body.authenticated).toBe(true)
    expect(body.username).toBe('prof')
  })
})

describe('routes /api/* proteges', () => {
  it('refuse l acces sans session', async () => {
    const res = await fetch(`${baseUrl}/api/students`)
    expect(res.status).toBe(401)
  })
})
