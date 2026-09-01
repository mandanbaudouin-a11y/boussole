import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEA } from './helpers.js'

let baseUrl
let server
let teacherCookie
let eaCookie

beforeAll(async () => {
  server = await start(0)
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server.close()
})

beforeEach(async () => {
  db.exec('DELETE FROM users')
  db.exec('DELETE FROM students')
  db.exec('DELETE FROM goals')

  const teacher = await setupTeacher(baseUrl)
  teacherCookie = teacher.cookie
  await createEA(baseUrl, teacherCookie)
  const ea = await login(baseUrl, { username: 'assistant', password: 'test1234', role: 'ea' })
  eaCookie = ea.cookie
})

function authed(cookie, init = {}) {
  return {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers || {}) },
  }
}

async function createStudent(cookie = teacherCookie, overrides = {}) {
  return fetch(
    `${baseUrl}/api/students`,
    authed(cookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année', ...overrides }) })
  )
}

describe('POST /api/students', () => {
  it("l'enseignant peut creer un eleve", async () => {
    const res = await createStudent()
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.name).toBe('Léa Tremblay')
    expect(body.grade).toBe('2e année')
  })

  it("l'EA ne peut pas creer d'eleve", async () => {
    const res = await createStudent(eaCookie)
    expect(res.status).toBe(403)
  })

  it('refuse un eleve sans nom ou sans niveau', async () => {
    const res = await createStudent(teacherCookie, { name: '' })
    expect(res.status).toBe(400)
  })

  it('refuse une date de revision mal formee', async () => {
    const res = await createStudent(teacherCookie, { nextReviewDate: '31-12-2026' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/students', () => {
  it("l'EA peut voir la liste des eleves (lecture seule)", async () => {
    await createStudent()
    const res = await fetch(`${baseUrl}/api/students`, authed(eaCookie))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
  })
})

describe('PATCH / DELETE /api/students/:id', () => {
  it("l'enseignant peut modifier un eleve", async () => {
    const created = await (await createStudent()).json()
    const res = await fetch(
      `${baseUrl}/api/students/${created.id}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ grade: '3e année' }) })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.grade).toBe('3e année')
  })

  it("l'EA ne peut pas modifier un eleve", async () => {
    const created = await (await createStudent()).json()
    const res = await fetch(
      `${baseUrl}/api/students/${created.id}`,
      authed(eaCookie, { method: 'PATCH', body: JSON.stringify({ grade: '3e année' }) })
    )
    expect(res.status).toBe(403)
  })

  it("l'EA ne peut pas supprimer un eleve", async () => {
    const created = await (await createStudent()).json()
    const res = await fetch(`${baseUrl}/api/students/${created.id}`, authed(eaCookie, { method: 'DELETE' }))
    expect(res.status).toBe(403)
  })

  it("l'enseignant peut supprimer un eleve", async () => {
    const created = await (await createStudent()).json()
    const res = await fetch(`${baseUrl}/api/students/${created.id}`, authed(teacherCookie, { method: 'DELETE' }))
    expect(res.status).toBe(204)
    const list = await (await fetch(`${baseUrl}/api/students`, authed(teacherCookie))).json()
    expect(list).toHaveLength(0)
  })

  it('renvoie 404 pour un eleve inexistant', async () => {
    const res = await fetch(`${baseUrl}/api/students/inexistant`, authed(teacherCookie, { method: 'DELETE' }))
    expect(res.status).toBe(404)
  })
})

describe('objectifs — droits partages entre enseignant et EA', () => {
  async function createGoal() {
    const student = await (await createStudent()).json()
    const goalRes = await fetch(
      `${baseUrl}/api/students/${student.id}/goals`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ label: 'Lire 10 min par jour' }) })
    )
    return goalRes.json()
  }

  it("l'enseignant peut creer un objectif, l'EA non", async () => {
    const student = await (await createStudent()).json()
    const eaRes = await fetch(
      `${baseUrl}/api/students/${student.id}/goals`,
      authed(eaCookie, { method: 'POST', body: JSON.stringify({ label: 'Interdit' }) })
    )
    expect(eaRes.status).toBe(403)
  })

  it("l'EA peut cocher/decocher un objectif (done)", async () => {
    const goal = await createGoal()
    const res = await fetch(
      `${baseUrl}/api/goals/${goal.id}`,
      authed(eaCookie, { method: 'PATCH', body: JSON.stringify({ done: true }) })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.done).toBe(true)
  })

  it("l'EA ne peut pas modifier le texte d'un objectif", async () => {
    const goal = await createGoal()
    const res = await fetch(
      `${baseUrl}/api/goals/${goal.id}`,
      authed(eaCookie, { method: 'PATCH', body: JSON.stringify({ label: 'Texte modifie par l EA' }) })
    )
    expect(res.status).toBe(403)
  })

  it("l'EA ne peut pas changer le niveau de satisfaction d'un objectif", async () => {
    const goal = await createGoal()
    const res = await fetch(
      `${baseUrl}/api/goals/${goal.id}`,
      authed(eaCookie, { method: 'PATCH', body: JSON.stringify({ status: 'atteint' }) })
    )
    expect(res.status).toBe(403)
  })

  it("l'enseignant peut modifier le texte et le statut d'un objectif", async () => {
    const goal = await createGoal()
    const res = await fetch(
      `${baseUrl}/api/goals/${goal.id}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ label: 'Nouveau texte', status: 'atteint' }) })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.label).toBe('Nouveau texte')
    expect(body.status).toBe('atteint')
  })

  it("l'EA ne peut pas supprimer un objectif", async () => {
    const goal = await createGoal()
    const res = await fetch(`${baseUrl}/api/goals/${goal.id}`, authed(eaCookie, { method: 'DELETE' }))
    expect(res.status).toBe(403)
  })

  it("l'enseignant peut supprimer un objectif", async () => {
    const goal = await createGoal()
    const res = await fetch(`${baseUrl}/api/goals/${goal.id}`, authed(teacherCookie, { method: 'DELETE' }))
    expect(res.status).toBe(204)
  })

  it('rejette un niveau de satisfaction invalide', async () => {
    const goal = await createGoal()
    const res = await fetch(
      `${baseUrl}/api/goals/${goal.id}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ status: 'inexistant' }) })
    )
    expect(res.status).toBe(400)
  })
})
