import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEA, createEnseignant } from './helpers.js'

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

let teacherCookie

beforeEach(async () => {
  db.exec('DELETE FROM users')
  db.exec('DELETE FROM students')
  db.exec('DELETE FROM report_versions')
  const teacher = await setupTeacher(baseUrl)
  teacherCookie = teacher.cookie
})

describe('POST /api/auth/create-enseignant (compte collaborateur, ex. enseignant-ressource)', () => {
  it("l'enseignant peut creer un second compte enseignant avec des droits complets", async () => {
    const res = await createEnseignant(baseUrl, teacherCookie)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.role).toBe('enseignant')

    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    expect(ressource.res.status).toBe(200)

    const createRes = await fetch(
      `${baseUrl}/api/students`,
      authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ name: 'Nouvel élève', grade: '3e année' }) })
    )
    expect(createRes.status).toBe(201)
  })

  it("l'EA ne peut pas creer de compte enseignant collaborateur", async () => {
    await createEA(baseUrl, teacherCookie)
    const ea = await login(baseUrl, { username: 'assistant', password: 'test1234', role: 'ea' })
    const res = await createEnseignant(baseUrl, ea.cookie)
    expect(res.status).toBe(403)
  })

  it('exige un nom complet', async () => {
    const res = await createEnseignant(baseUrl, teacherCookie, { nomComplet: '' })
    expect(res.status).toBe(400)
  })

  it("refuse un nom d'utilisateur deja pris", async () => {
    await createEnseignant(baseUrl, teacherCookie)
    const res = await createEnseignant(baseUrl, teacherCookie)
    expect(res.status).toBe(409)
  })

  it('le nouveau compte apparait dans la liste des comptes avec son titre', async () => {
    await createEnseignant(baseUrl, teacherCookie, { titre: 'enseignant_ressource' })
    const list = await (await fetch(`${baseUrl}/api/auth/accounts`, authed(teacherCookie))).json()
    const ressource = list.find((a) => a.username === 'ressource')
    expect(ressource.role).toBe('enseignant')
    expect(ressource.titre).toBe('enseignant_ressource')
  })
})

describe('attribution correcte de "genere par" / "exporte par" (plusieurs comptes enseignant)', () => {
  it("un export fait par le collaborateur porte son propre nom, pas celui du premier compte", async () => {
    await createEnseignant(baseUrl, teacherCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })

    const student = await (
      await fetch(`${baseUrl}/api/students`, authed(teacherCookie, { method: 'POST', body: JSON.stringify({ name: 'Élève test', grade: '1re année' }) }))
    ).json()

    await fetch(`${baseUrl}/api/students/${student.id}/report.pdf`, authed(ressource.cookie))

    const versions = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(student.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].exported_by).toBe('Nadia Ressource')
  })

  it("un export fait par le compte enseignant principal porte toujours son propre nom", async () => {
    const student = await (
      await fetch(`${baseUrl}/api/students`, authed(teacherCookie, { method: 'POST', body: JSON.stringify({ name: 'Élève test', grade: '1re année' }) }))
    ).json()
    await createEnseignant(baseUrl, teacherCookie)

    await fetch(`${baseUrl}/api/students/${student.id}/report.pdf`, authed(teacherCookie))

    const versions = db.prepare('SELECT * FROM report_versions WHERE student_id = ?').all(student.id)
    expect(versions[0].exported_by).toBe('Baudouin Mandan')
  })
})

describe('GET/POST /api/network-settings', () => {
  it('est desactive par defaut', async () => {
    const res = await fetch(`${baseUrl}/api/network-settings`, authed(teacherCookie))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.lanSharingEnabled).toBe(false)
    expect(Array.isArray(body.lanAddresses)).toBe(true)
  })

  it("l'enseignant peut activer le partage reseau", async () => {
    const res = await fetch(`${baseUrl}/api/network-settings`, authed(teacherCookie, { method: 'POST', body: JSON.stringify({ lanSharingEnabled: true }) }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.lanSharingEnabled).toBe(true)

    const getRes = await (await fetch(`${baseUrl}/api/network-settings`, authed(teacherCookie))).json()
    expect(getRes.lanSharingEnabled).toBe(true)
  })

  it("l'EA n'a pas acces aux reglages reseau", async () => {
    await createEA(baseUrl, teacherCookie)
    const ea = await login(baseUrl, { username: 'assistant', password: 'test1234', role: 'ea' })
    const res = await fetch(`${baseUrl}/api/network-settings`, authed(ea.cookie))
    expect(res.status).toBe(403)
  })
})
