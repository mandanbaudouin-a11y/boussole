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

describe('tracabilite des contributions : eleve', () => {
  it("enregistre l'auteur et la date a la creation", async () => {
    const list = await (await fetch(`${baseUrl}/api/students`, authed(ownerCookie))).json()
    const created = list.find((s) => s.id === studentId)
    expect(created.modifiedBy).toBe('Baudouin Mandan')
    expect(created.modifiedAt).toBeTruthy()
  })

  it('met a jour l\'auteur et la date a chaque sauvegarde (forces/besoins)', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ forces: 'Curieuse et perseverante' }) })
    )
    const body = await res.json()
    expect(body.modifiedBy).toBe('Baudouin Mandan')
    expect(body.forces).toBe('Curieuse et perseverante')
  })

  it("attribue la modification au compte collaborateur assigne, pas au proprietaire", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    const res = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(ressource.cookie, { method: 'PATCH', body: JSON.stringify({ besoins: 'Plus de temps aux transitions' }) })
    )
    const body = await res.json()
    expect(body.modifiedBy).toBe('Nadia Ressource')
  })
})

describe('tracabilite des contributions : objectifs', () => {
  it("enregistre l'auteur a la creation et resout le nom dans l'historique", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/goals`,
      authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'Lire 10 minutes par jour' }) })
    )
    const goal = await res.json()
    expect(goal.modifiedBy).toBe('Baudouin Mandan')
    expect(goal.statusHistory).toHaveLength(1)
    expect(goal.statusHistory[0].changed_by).toBe('Baudouin Mandan')
  })

  it("met a jour l'auteur a chaque modification, y compris un changement de statut", async () => {
    const created = await (
      await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    ).json()

    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    const res = await fetch(
      `${baseUrl}/api/goals/${created.id}`,
      authed(ressource.cookie, { method: 'PATCH', body: JSON.stringify({ status: 'en_progres' }) })
    )
    const updated = await res.json()
    expect(updated.modifiedBy).toBe('Nadia Ressource')
    expect(updated.statusHistory).toHaveLength(2)
    expect(updated.statusHistory[0].changed_by).toBe('Nadia Ressource')
    expect(updated.statusHistory[1].changed_by).toBe('Baudouin Mandan')
  })
})

describe('tracabilite des contributions : adaptations et modifications', () => {
  it('enregistre l\'auteur a la creation d\'une adaptation', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(ownerCookie, { method: 'POST', body: JSON.stringify({ subtype: 'pedagogique', description: 'Temps supplémentaire' }) })
    )
    const body = await res.json()
    expect(body.modifiedBy).toBe('Baudouin Mandan')
    expect(body.modifiedAt).toBeTruthy()
  })

  it('enregistre l\'auteur a la creation d\'une modification', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/modifications`,
      authed(ownerCookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'niveau_scolaire_different', subject: 'Lecture', description: 'Textes de 1re année' }),
      })
    )
    const body = await res.json()
    expect(body.modifiedBy).toBe('Baudouin Mandan')
    expect(body.modifiedAt).toBeTruthy()
  })
})

describe('resolution du nom : compatibilite avec les anciennes donnees', () => {
  it("affiche la valeur brute si changed_by ne correspond a aucun compte (ancien format username)", async () => {
    const created = await (
      await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    ).json()
    // Simule une ligne d'historique ecrite avant cette fonctionnalite (ancien
    // format : nom d'utilisateur brut plutot qu'un id de compte).
    db.prepare("INSERT INTO goal_status_history (goal_id, status, changed_by) VALUES (?, 'atteint', 'ancien-nom-utilisateur')").run(created.id)

    const res = await fetch(`${baseUrl}/api/students`, authed(ownerCookie))
    const list = await res.json()
    const goal = list.find((s) => s.id === studentId).goals.find((g) => g.id === created.id)
    const legacyEntry = goal.statusHistory.find((h) => h.status === 'atteint')
    expect(legacyEntry.changed_by).toBe('ancien-nom-utilisateur')
  })
})
