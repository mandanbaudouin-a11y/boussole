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

describe('bibliotheques de suggestions (adaptations, forces/besoins)', () => {
  it('la bibliotheque d adaptations contient des entrees pour les 3 sous-types', async () => {
    const res = await fetch(`${baseUrl}/api/adaptations-library`, authed(teacherCookie))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.length).toBeGreaterThanOrEqual(10)
    const subtypes = new Set(body.map((a) => a.subtype))
    expect(subtypes).toEqual(new Set(['pedagogique', 'environnementale', 'evaluation']))
  })

  it('la bibliotheque forces/besoins contient les deux champs', async () => {
    const res = await fetch(`${baseUrl}/api/forces-besoins-library`, authed(teacherCookie))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.length).toBeGreaterThanOrEqual(10)
    const fields = new Set(body.map((e) => e.field))
    expect(fields).toEqual(new Set(['forces', 'besoins']))
  })

  it('les deux bibliotheques restent accessibles a l EA (lecture seule)', async () => {
    const adaptRes = await fetch(`${baseUrl}/api/adaptations-library`, authed(eaCookie))
    const fbRes = await fetch(`${baseUrl}/api/forces-besoins-library`, authed(eaCookie))
    expect(adaptRes.status).toBe(200)
    expect(fbRes.status).toBe(200)
  })

  it('une adaptation ajoutee via une suggestion de la bibliotheque garde le bon sous-type', async () => {
    const library = await (await fetch(`${baseUrl}/api/adaptations-library`, authed(teacherCookie))).json()
    const suggestion = library.find((a) => a.subtype === 'evaluation')
    const res = await fetch(
      `${baseUrl}/api/students/${studentId}/adaptations`,
      authed(teacherCookie, { method: 'POST', body: JSON.stringify({ subtype: 'evaluation', description: suggestion.label }) })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.description).toBe(suggestion.label)
    expect(body.subtype).toBe('evaluation')
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

describe('historique de versions du rapport PEI', () => {
  it('enregistre une version a chaque export du rapport individuel', async () => {
    db.exec('DELETE FROM report_versions')
    const res = await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))
    expect(res.status).toBe(200)

    const versions = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)
    expect(versions).toHaveLength(1)
    expect(versions[0].exported_by).toBe('Baudouin Mandan')
    const snapshot = JSON.parse(versions[0].content_snapshot)
    expect(snapshot.id).toBe(studentId)
    expect(snapshot.name).toBe('Léa Tremblay')
  })

  it('enregistre une version par eleve lors de l export combine', async () => {
    db.exec('DELETE FROM report_versions')
    const res = await fetch(`${baseUrl}/api/reports/pdf`, authed(teacherCookie))
    expect(res.status).toBe(200)

    const versions = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)
    expect(versions).toHaveLength(1)
  })

  it('conserve le contenu exact au moment de l export meme si le PEI change ensuite', async () => {
    db.exec('DELETE FROM report_versions')
    await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))

    await fetch(`${baseUrl}/api/students/${studentId}`, authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ name: 'Nom modifie apres export' }) }))

    const versions = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)
    const snapshot = JSON.parse(versions[0].content_snapshot)
    expect(snapshot.name).toBe('Léa Tremblay')
  })

  it("chaque export cree une nouvelle ligne distincte (l'historique s'accumule)", async () => {
    db.exec('DELETE FROM report_versions')
    await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))
    await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))

    const versionsAccumulated = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)
    expect(versionsAccumulated).toHaveLength(2)
  })

  it('associe une version precise a la remise de copie', async () => {
    db.exec('DELETE FROM report_versions')
    await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))
    const [version] = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)

    const res = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ copyDeliveryDate: '2026-09-15', deliveredVersionId: version.id }) })
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.deliveredVersionId).toBe(version.id)
    expect(body.copyDeliveryDate).toBe('2026-09-15')
  })

  it('rejette une version qui n appartient pas a cet eleve', async () => {
    const otherStudent = await (
      await fetch(`${baseUrl}/api/students`, authed(teacherCookie, { method: 'POST', body: JSON.stringify({ name: 'Autre élève', grade: '1re année' }) }))
    ).json()
    await fetch(`${baseUrl}/api/students/${otherStudent.id}/report.pdf`, authed(teacherCookie))
    const [otherVersion] = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(otherStudent.id)

    const res = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ copyDeliveryDate: '2026-09-15', deliveredVersionId: otherVersion.id }) })
    )
    expect(res.status).toBe(400)
  })

  it('efface la version associee quand la date de remise est retiree', async () => {
    await fetch(`${baseUrl}/api/students/${studentId}/report.pdf`, authed(teacherCookie))
    const [version] = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(studentId)
    await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ copyDeliveryDate: '2026-09-15', deliveredVersionId: version.id }) })
    )

    const res = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(teacherCookie, { method: 'PATCH', body: JSON.stringify({ copyDeliveryDate: '' }) })
    )
    const body = await res.json()
    expect(body.copyDeliveryDate).toBeNull()
    expect(body.deliveredVersionId).toBeNull()
  })
})
