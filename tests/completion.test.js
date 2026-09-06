import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEnseignant, createAssignmentGrant } from './helpers.js'

let baseUrl
let server

beforeAll(async () => {
  server = await start(0)
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server.close()
})

function authed(cookie, init = {}) {
  return {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers || {}) },
  }
}

let ownerCookie
let studentId

beforeEach(async () => {
  db.exec('DELETE FROM users')
  db.exec('DELETE FROM students')
  db.exec('DELETE FROM teacher_assignments')

  const owner = await setupTeacher(baseUrl)
  ownerCookie = owner.cookie

  const student = await (
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
  ).json()
  studentId = student.id
})

describe('GET /api/students/completion', () => {
  it('marque tout comme manquant pour un eleve tout juste cree', async () => {
    const res = await fetch(`${baseUrl}/api/students/completion`, authed(ownerCookie))
    const body = await res.json()
    const entry = body.find((s) => s.id === studentId)
    expect(entry.sections).toEqual({
      profil: false,
      objectifs: false,
      adaptationsModifications: false,
      transition: null, // pas de date de naissance -> non applicable
      consultation: false,
    })
    expect(entry.lastModifiedAt).toBeTruthy() // la creation elle-meme a pose modified_at
  })

  it('passe une section a "rempli" des qu il y a du contenu', async () => {
    await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ forces: 'Curieuse', besoins: 'Transitions' }) })
    )
    await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(ownerCookie, { method: 'POST', body: JSON.stringify({ subtype: 'pedagogique', description: 'x' }) })
    )
    await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ copyDeliveryDate: '2026-09-15' }) })
    )

    const res = await fetch(`${baseUrl}/api/students/completion`, authed(ownerCookie))
    const entry = (await res.json()).find((s) => s.id === studentId)
    expect(entry.sections.profil).toBe(true)
    expect(entry.sections.objectifs).toBe(true)
    expect(entry.sections.adaptationsModifications).toBe(true)
    expect(entry.sections.consultation).toBe(true)
  })

  it("le profil reste incomplet si seul forces OU besoins est rempli", async () => {
    await fetch(`${baseUrl}/api/students/${studentId}`, authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ forces: 'Curieuse' }) }))
    const entry = (await (await fetch(`${baseUrl}/api/students/completion`, authed(ownerCookie))).json()).find((s) => s.id === studentId)
    expect(entry.sections.profil).toBe(false)
  })

  it("le plan de transition est n/a sous 14 ans, puis un vrai statut une fois applicable", async () => {
    const today = new Date()
    const fifteenYearsAgo = `${today.getFullYear() - 15}-01-01`
    await fetch(`${baseUrl}/api/students/${studentId}`, authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ birthdate: fifteenYearsAgo }) }))

    let entry = (await (await fetch(`${baseUrl}/api/students/completion`, authed(ownerCookie))).json()).find((s) => s.id === studentId)
    expect(entry.sections.transition).toBe(false) // applicable (15 ans) mais aucun objectif de transition

    await fetch(
      `${baseUrl}/api/students/${studentId}/transition-goals`,
      authed(ownerCookie, { method: 'POST', body: JSON.stringify({ description: 'Visiter la nouvelle classe' }) })
    )
    entry = (await (await fetch(`${baseUrl}/api/students/completion`, authed(ownerCookie))).json()).find((s) => s.id === studentId)
    expect(entry.sections.transition).toBe(true)
  })

  it("ne montre que les eleves accessibles via accessibleTeacherIds", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })

    const before = await (await fetch(`${baseUrl}/api/students/completion`, authed(ressource.cookie))).json()
    expect(before).toHaveLength(0)

    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    const after = await (await fetch(`${baseUrl}/api/students/completion`, authed(ressource.cookie))).json()
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(studentId)
  })
})
