import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher } from './helpers.js'

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

  const owner = await setupTeacher(baseUrl)
  ownerCookie = owner.cookie

  const student = await (
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
  ).json()
  studentId = student.id
})

async function getStudent() {
  const students = await (await fetch(`${baseUrl}/api/students`, authed(ownerCookie))).json()
  return students.find((s) => s.id === studentId)
}

// Insere directement un changement de statut à une date passée, en
// contournant la route (qui pose toujours `datetime('now')`) — seul moyen de
// simuler un historique sur plusieurs semaines dans un test.
function backdateStatusChange(goalId, status, daysAgo) {
  const date = new Date(Date.now() - daysAgo * 86400000)
  const changedAt = date.toISOString().slice(0, 19).replace('T', ' ')
  db.prepare('INSERT INTO goal_status_history (goal_id, status, changed_at, changed_by) VALUES (?, ?, ?, NULL)').run(
    goalId,
    status,
    changedAt
  )
}

describe('Taux de réussite hebdomadaire (calculé, pas stocké)', () => {
  it("un élève sans objectif n'a aucun taux hebdomadaire", async () => {
    const student = await getStudent()
    expect(student.weeklyRate).toEqual([])
  })

  it('un objectif tout juste créé compte pour la semaine en cours seulement', async () => {
    await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    const student = await getStudent()
    expect(student.weeklyRate).toHaveLength(1)
    expect(student.weeklyRate[0]).toEqual({ week: 'Sem. 1', pct: 0 }) // non_atteint par défaut
  })

  it('le taux reflète le statut de chaque objectif au fil des semaines, ignore les semaines sans objectif', async () => {
    const goal = await (
      await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x' }) }))
    ).json()

    // L'objectif existe seulement depuis 10 jours (~1.5 semaine) : les
    // semaines plus anciennes ne doivent pas apparaître.
    db.exec(`DELETE FROM goal_status_history WHERE goal_id = '${goal.id}'`)
    backdateStatusChange(goal.id, 'non_atteint', 10)
    backdateStatusChange(goal.id, 'atteint', 2)

    const student = await getStudent()
    // Créé il y a seulement 10 jours (moins de 4 semaines) : au moins une des
    // 4 semaines candidates doit être exclue faute d'objectif existant.
    expect(student.weeklyRate.length).toBeGreaterThanOrEqual(1)
    expect(student.weeklyRate.length).toBeLessThan(4)
    expect(student.weeklyRate[student.weeklyRate.length - 1].pct).toBe(100) // statut actuel : atteint
    expect(student.weeklyRate[0].pct).toBe(0) // au tout début : non_atteint
  })

  it('moyenne plusieurs objectifs actifs la même semaine', async () => {
    const g1 = await (
      await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'a' }) }))
    ).json()
    const g2 = await (
      await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'b' }) }))
    ).json()

    await fetch(`${baseUrl}/api/goals/${g2.id}`, authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ status: 'atteint' }) }))

    const student = await getStudent()
    // g1 = non_atteint (0), g2 = atteint (100) -> moyenne 50
    expect(student.weeklyRate).toHaveLength(1)
    expect(student.weeklyRate[0].pct).toBe(50)
  })

  it("n'est pas affecté par une restauration de sauvegarde (recalculé à partir des objectifs restaurés)", async () => {
    await fetch(`${baseUrl}/api/students/${studentId}/goals`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ label: 'x', status: 'atteint' }) }))
    await fetch(`${baseUrl}/api/goals/${(await getStudent()).goals[0].id}`, authed(ownerCookie, { method: 'PATCH', body: JSON.stringify({ status: 'atteint' }) }))

    const backupRes = await fetch(`${baseUrl}/api/backup/export`, authed(ownerCookie))
    const backupBlob = await backupRes.blob()

    const form = new FormData()
    form.append('file', backupBlob, 'backup.json')
    const restoreRes = await fetch(`${baseUrl}/api/backup/restore`, { method: 'POST', headers: { Cookie: ownerCookie }, body: form })
    expect(restoreRes.status).toBe(200)

    const students = await (await fetch(`${baseUrl}/api/students`, authed(ownerCookie))).json()
    expect(students).toHaveLength(1)
    expect(students[0].weeklyRate).toHaveLength(1)
    expect(students[0].weeklyRate[0].pct).toBe(100)
  })
})
