import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEnseignant, createDirection, createAssignmentGrant } from './helpers.js'

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

beforeEach(async () => {
  db.exec('DELETE FROM users')
  db.exec('DELETE FROM students')
  db.exec('DELETE FROM teacher_assignments')

  const owner = await setupTeacher(baseUrl)
  ownerCookie = owner.cookie
})

describe('données de navigation par enseignant-ressource', () => {
  it('GET /api/auth/assignments est accessible à Direction et expose les ids', async () => {
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
    await createEnseignant(baseUrl, ownerCookie, { username: 'ressource', nomComplet: 'Nadia Ressource' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const res = await fetch(`${baseUrl}/api/auth/assignments`, authed(direction.cookie))
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list).toHaveLength(1)
    expect(list[0].resourceUserId).toBeTruthy()
    expect(list[0].ownerUserId).toBeTruthy()
    expect(list[0].resourceNomComplet).toBe('Nadia Ressource')
    expect(list[0].ownerNomComplet).toBe('Baudouin Mandan')
  })

  it("GET /api/students expose teacherId, permettant de regrouper par classe", async () => {
    const student = await (
      await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
    ).json()
    expect(student.teacherId).toBeTruthy()

    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })
    const list = await (await fetch(`${baseUrl}/api/students`, authed(direction.cookie))).json()
    expect(list[0].teacherId).toBe(student.teacherId)
  })

  it("un enseignant-ressource assigné à deux classes apparaît une fois par assignation (niveau 1 regroupe par resourceUserId, niveau 2 liste chaque classe)", async () => {
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
    await createEnseignant(baseUrl, ownerCookie, { username: 'collegue', nomComplet: 'Un Collègue' })
    const collegue = await login(baseUrl, { username: 'collegue', password: 'test1234', role: 'enseignant' })
    await fetch(`${baseUrl}/api/students`, authed(collegue.cookie, { method: 'POST', body: JSON.stringify({ name: 'Noah B.', grade: '1re année' }) }))

    await createEnseignant(baseUrl, ownerCookie, { username: 'ressource', nomComplet: 'Nadia Ressource' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'collegue')

    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const assignments = await (await fetch(`${baseUrl}/api/auth/assignments`, authed(direction.cookie))).json()
    const resourceRows = assignments.filter((a) => a.resourceNomComplet === 'Nadia Ressource')
    expect(resourceRows).toHaveLength(2) // niveau 2 : deux classes pour ce même enseignant-ressource
    expect(new Set(resourceRows.map((a) => a.resourceUserId)).size).toBe(1) // même id -> même personne au niveau 1
    expect(resourceRows.map((a) => a.ownerNomComplet).sort()).toEqual(['Baudouin Mandan', 'Un Collègue'])
  })

  it("un enseignant non-Direction/non-propriétaire reste refusé sur /api/auth/assignments en écriture (portée inchangée)", async () => {
    await createEnseignant(baseUrl, ownerCookie, { username: 'ressource', nomComplet: 'Nadia Ressource' })
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    const res = await fetch(`${baseUrl}/api/auth/assignments`, authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ resourceUsername: 'ressource', ownerUsername: 'prof' }) }))
    expect(res.status).toBe(403)
  })
})
