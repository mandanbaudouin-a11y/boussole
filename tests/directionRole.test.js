import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEnseignant, createDirection } from './helpers.js'

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

describe('création du compte Direction', () => {
  it('le propriétaire peut créer un compte Direction', async () => {
    const res = await createDirection(baseUrl, ownerCookie)
    expect(res.status).toBe(201)
    expect((await res.json()).role).toBe('direction')
  })

  it("un enseignant non-propriétaire ne peut pas créer de compte Direction", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const collab = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    const res = await createDirection(baseUrl, collab.cookie)
    expect(res.status).toBe(403)
  })

  it('un compte Direction ne peut pas créer un autre compte (EA, enseignant ou Direction)', async () => {
    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const ea = await fetch(`${baseUrl}/api/auth/create-ea`, authed(direction.cookie, { method: 'POST', body: JSON.stringify({ username: 'assistant', password: 'test1234' }) }))
    expect(ea.status).toBe(403)

    const collab = await createEnseignant(baseUrl, direction.cookie)
    expect(collab.status).toBe(403)

    const anotherDirection = await createDirection(baseUrl, direction.cookie, { username: 'direction2' })
    expect(anotherDirection.status).toBe(403)
  })
})

describe('portée : la Direction voit toute l\'école sans assignation', () => {
  it('voit les élèves de plusieurs comptes enseignant différents, sans aucune assignation', async () => {
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))

    await createEnseignant(baseUrl, ownerCookie, { username: 'collegue', nomComplet: 'Un Collègue' })
    const collegue = await login(baseUrl, { username: 'collegue', password: 'test1234', role: 'enseignant' })
    await fetch(`${baseUrl}/api/students`, authed(collegue.cookie, { method: 'POST', body: JSON.stringify({ name: 'Noah B.', grade: '1re année' }) }))

    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const list = await (await fetch(`${baseUrl}/api/students`, authed(direction.cookie))).json()
    expect(list.map((s) => s.name).sort()).toEqual(['Léa Tremblay', 'Noah B.'])

    const completion = await (await fetch(`${baseUrl}/api/students/completion`, authed(direction.cookie))).json()
    expect(completion).toHaveLength(2)
  })

  it("un nouvel enseignant qui n'existait pas encore à la création du compte Direction est quand même visible (calculé à chaque requête)", async () => {
    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    await createEnseignant(baseUrl, ownerCookie, { username: 'nouveau', nomComplet: 'Nouvel Enseignant' })
    const nouveau = await login(baseUrl, { username: 'nouveau', password: 'test1234', role: 'enseignant' })
    await fetch(`${baseUrl}/api/students`, authed(nouveau.cookie, { method: 'POST', body: JSON.stringify({ name: 'Sam', grade: 'Maternelle' }) }))

    const list = await (await fetch(`${baseUrl}/api/students`, authed(direction.cookie))).json()
    expect(list.map((s) => s.name)).toEqual(['Sam'])
  })
})

describe('lecture seule : la Direction ne peut rien modifier', () => {
  it('peut lire mais pas créer, modifier ou supprimer un élève', async () => {
    const student = await (
      await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
    ).json()
    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const read = await fetch(`${baseUrl}/api/students`, authed(direction.cookie))
    expect(read.status).toBe(200)

    const create = await fetch(`${baseUrl}/api/students`, authed(direction.cookie, { method: 'POST', body: JSON.stringify({ name: 'x', grade: 'y' }) }))
    expect(create.status).toBe(403)

    const patch = await fetch(`${baseUrl}/api/students/${student.id}`, authed(direction.cookie, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) }))
    expect(patch.status).toBe(403)

    const del = await fetch(`${baseUrl}/api/students/${student.id}`, authed(direction.cookie, { method: 'DELETE' }))
    expect(del.status).toBe(403)
  })

  it('ne peut pas ajouter un objectif ni une note', async () => {
    const student = await (
      await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
    ).json()
    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const goal = await fetch(`${baseUrl}/api/students/${student.id}/goals`, authed(direction.cookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    expect(goal.status).toBe(403)

    const note = await fetch(`${baseUrl}/api/students/${student.id}/notes`, authed(direction.cookie, { method: 'POST', body: JSON.stringify({ text: 'x' }) }))
    expect(note.status).toBe(403)
  })

  it('ne peut ni gérer les comptes ni le réseau local', async () => {
    await createDirection(baseUrl, ownerCookie)
    const direction = await login(baseUrl, { username: 'direction', password: 'test1234', role: 'direction' })

    const accounts = await fetch(`${baseUrl}/api/auth/accounts`, authed(direction.cookie))
    expect(accounts.status).toBe(403)

    const network = await fetch(`${baseUrl}/api/network-settings`, authed(direction.cookie))
    expect(network.status).toBe(403)
  })
})
