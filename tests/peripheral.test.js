import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEA } from './helpers.js'

let baseUrl
let server
let teacherCookie
let eaCookie
let studentId

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

beforeEach(async () => {
  db.exec('DELETE FROM users')
  db.exec('DELETE FROM students')

  const teacher = await setupTeacher(baseUrl)
  teacherCookie = teacher.cookie
  await createEA(baseUrl, teacherCookie)
  const ea = await login(baseUrl, { username: 'assistant', password: 'test1234', role: 'ea' })
  eaCookie = ea.cookie

  const studentRes = await fetch(
    `${baseUrl}/api/students`,
    authed(teacherCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) })
  )
  studentId = (await studentRes.json()).id
})

describe('adaptations', () => {
  it("l'enseignant peut ajouter une adaptation", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ subtype: 'pedagogique', description: 'Temps supplémentaire' }) })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.description).toBe('Temps supplémentaire')
  })

  it("l'EA ne peut pas ajouter d'adaptation", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(eaCookie, { method: 'POST', body: JSON.stringify({ subtype: 'pedagogique', description: 'Interdit' }) })
    )
    expect(res.status).toBe(403)
  })

  it('rejette un sous-type invalide', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ subtype: 'inexistant', description: 'x' }) })
    )
    expect(res.status).toBe(400)
  })

  it('rejette une description vide', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ subtype: 'pedagogique', description: '' }) })
    )
    expect(res.status).toBe(400)
  })

  it('supprime une adaptation existante', async () => {
    const created = await (
      await fetch(
        `${baseUrl}/api/students/${studentId}/adaptations`,
        authed(teacherCookie, { method: 'POST', body: JSON.stringify({ subtype: 'evaluation', description: 'x' }) })
      )
    ).json()
    const res = await fetch(`${baseUrl}/api/adaptations/${created.id}`, authed(teacherCookie, { method: 'DELETE' }))
    expect(res.status).toBe(204)
  })
})

describe('modifications', () => {
  it("l'enseignant peut ajouter une modification", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/modifications`,
      authed(teacherCookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'niveau_scolaire_different', subject: 'Lecture', description: 'Textes de 1re année' }),
      })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.subject).toBe('Lecture')
  })

  it("l'EA ne peut pas ajouter de modification", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/modifications`,
      authed(eaCookie, { method: 'POST', body: JSON.stringify({ type: 'niveau_scolaire_different', subject: 'Lecture', description: 'x' }) })
    )
    expect(res.status).toBe(403)
  })

  it('exige une matiere concernee', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/modifications`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ type: 'niveau_scolaire_different', subject: '', description: 'x' }) })
    )
    expect(res.status).toBe(400)
  })
})

describe('plan de transition', () => {
  it('cree un objectif de transition puis une etape', async () => {
    const goalRes = await fetch(
      `${baseUrl}/api/students/${studentId}/transition-goals`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ description: 'Visiter la nouvelle classe' }) })
    )
    const goal = await goalRes.json()
    expect(goalRes.status).toBe(201)

    const stepRes = await fetch(
      `${baseUrl}/api/transition-goals/${goal.id}/steps`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ description: 'Premiere visite en juin' }) })
    )
    expect(stepRes.status).toBe(201)
  })

  it("l'EA ne peut pas creer d'objectif de transition", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/transition-goals`,
      authed(eaCookie, { method: 'POST', body: JSON.stringify({ description: 'Interdit' }) })
    )
    expect(res.status).toBe(403)
  })

  it('rejette une date cible mal formee', async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/transition-goals`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ description: 'x', targetDate: 'juin 2026' }) })
    )
    expect(res.status).toBe(400)
  })
})

describe('notes de suivi', () => {
  it("l'enseignant peut ajouter une note", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/notes`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ text: 'Bonne journée' }) })
    )
    expect(res.status).toBe(201)
  })

  it("l'EA peut aussi ajouter une note", async () => {
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/notes`,
      authed(eaCookie, { method: 'POST', body: JSON.stringify({ text: 'Difficulté à la transition du dîner' }) })
    )
    expect(res.status).toBe(201)
  })

  it('rejette une note vide', async () => {
    const res = await fetch(`${baseUrl}/api/students/${studentId}/notes`, authed(teacherCookie, { method: 'POST', body: JSON.stringify({ text: '  ' }) }))
    expect(res.status).toBe(400)
  })
})

describe('sauvegarde et restauration', () => {
  it('exporte un JSON contenant les eleves existants', async () => {
    const res = await fetch(`${baseUrl}/api/backup/export`, authed(teacherCookie))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.students).toHaveLength(1)
    expect(body.students[0].name).toBe('Léa Tremblay')
  })

  it("l'EA ne peut pas exporter de sauvegarde", async () => {
    const res = await fetch(`${baseUrl}/api/backup/export`, authed(eaCookie))
    expect(res.status).toBe(403)
  })

  it('restaure une sauvegarde exportee juste avant (aller-retour complet)', async () => {
    const exportRes = await fetch(`${baseUrl}/api/backup/export`, authed(teacherCookie))
    const backup = await exportRes.json()

    db.exec('DELETE FROM students') // simule un poste vide avant restauration

    const form = new FormData()
    form.append('file', new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'sauvegarde.json')
    const restoreRes = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { Cookie: teacherCookie },
      body: form,
    })
    expect(restoreRes.status).toBe(200)

    const list = await (await fetch(`${baseUrl}/api/students`, authed(teacherCookie))).json()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Léa Tremblay')
  })

  it('refuse un fichier de sauvegarde invalide', async () => {
    const form = new FormData()
    form.append('file', new Blob(['{ pas un tableau students }'], { type: 'application/json' }), 'sauvegarde.json')
    const res = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { Cookie: teacherCookie },
      body: form,
    })
    expect(res.status).toBe(400)
  })

  it("l'EA ne peut pas restaurer de sauvegarde", async () => {
    const form = new FormData()
    form.append('file', new Blob(['{"students":[]}'], { type: 'application/json' }), 'sauvegarde.json')
    const res = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { Cookie: eaCookie },
      body: form,
    })
    expect(res.status).toBe(403)
  })
})
