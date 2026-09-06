import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../server/db.js'
import { start } from '../server/index.js'
import { setupTeacher, login, createEA, createEnseignant, createAssignmentGrant } from './helpers.js'

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
  db.exec('DELETE FROM report_versions')
  db.exec('DELETE FROM teacher_assignments')

  const owner = await setupTeacher(baseUrl)
  ownerCookie = owner.cookie

  const student = await (
    await fetch(`${baseUrl}/api/students`, authed(ownerCookie, { method: 'POST', body: JSON.stringify({ name: 'Léa Tremblay', grade: '2e année' }) }))
  ).json()
  studentId = student.id
})

describe('cloisonnement par classe : un enseignant ne voit que ses eleves', () => {
  it("un second compte enseignant sans assignation ne voit aucun eleve du premier", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })

    const list = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(list).toHaveLength(0)

    const res = await fetch(`${baseUrl}/api/students/${studentId}`, authed(ressource.cookie, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) }))
    expect(res.status).toBe(404)
  })

  it("une assignation donne un acces immediat, sans reconnexion", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })

    const before = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(before).toHaveLength(0)

    const grantRes = await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')
    expect(grantRes.status).toBe(201)

    const after = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(studentId)

    // Droits complets sur l'eleve assigne : peut aussi modifier.
    const patchRes = await fetch(
      `${baseUrl}/api/students/${studentId}`,
      authed(ressource.cookie, { method: 'PATCH', body: JSON.stringify({ name: 'Léa T. (modifiée)' }) })
    )
    expect(patchRes.status).toBe(200)
  })

  it("retirer l'assignation retire l'acces immediatement", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    const grant = await (await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')).json()

    const withAccess = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(withAccess).toHaveLength(1)

    const deleteRes = await fetch(`${baseUrl}/api/auth/assignments/${grant.id}`, authed(ownerCookie, { method: 'DELETE' }))
    expect(deleteRes.status).toBe(204)

    const afterRevoke = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(afterRevoke).toHaveLength(0)
  })

  it("un nouvel eleve cree par le collaborateur assigne lui appartient, pas au proprietaire", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    const created = await (
      await fetch(`${baseUrl}/api/students`, authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ name: 'Eleve du collaborateur', grade: '4e année' }) }))
    ).json()

    const ownerList = await (await fetch(`${baseUrl}/api/students`, authed(ownerCookie))).json()
    expect(ownerList.find((s) => s.id === created.id)).toBeUndefined()

    const ressourceList = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(ressourceList.find((s) => s.id === created.id)).toBeDefined()
  })

  it("rejette une assignation en double, un compte a lui-meme, ou un compte EA comme cible", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    await createEA(baseUrl, ownerCookie)

    const dup1 = await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')
    expect(dup1.status).toBe(201)
    const dup2 = await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')
    expect(dup2.status).toBe(409)

    const selfAssign = await createAssignmentGrant(baseUrl, ownerCookie, 'prof', 'prof')
    expect(selfAssign.status).toBe(400)

    const eaTarget = await createAssignmentGrant(baseUrl, ownerCookie, 'assistant', 'prof')
    expect(eaTarget.status).toBe(400)
  })
})

describe('portee des comptes EA : supervise par un enseignant precis', () => {
  it("un EA cree par l'enseignant A ne voit que les eleves de A", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await fetch(
      `${baseUrl}/api/students`,
      authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ name: 'Eleve de la ressource', grade: '5e année' }) })
    )

    await createEA(baseUrl, ownerCookie)
    const ea = await login(baseUrl, { username: 'assistant', password: 'test1234', role: 'ea' })

    const list = await (await fetch(`${baseUrl}/api/students`, authed(ea.cookie))).json()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(studentId)
  })
})

describe('sauvegarde/restauration cloisonnees', () => {
  it("l'export d'un enseignant ne contient pas les eleves d'un collegue", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await fetch(
      `${baseUrl}/api/students`,
      authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ name: 'Eleve de la ressource', grade: '5e année' }) })
    )

    const ownerBackup = await (await fetch(`${baseUrl}/api/backup/export`, authed(ownerCookie))).json()
    expect(ownerBackup.students).toHaveLength(1)
    expect(ownerBackup.students[0].name).toBe('Léa Tremblay')
  })

  it("restaurer sa propre sauvegarde ne supprime jamais les eleves d'un collegue", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await fetch(
      `${baseUrl}/api/students`,
      authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ name: 'Eleve de la ressource', grade: '5e année' }) })
    )

    const ownerBackup = await (await fetch(`${baseUrl}/api/backup/export`, authed(ownerCookie))).json()

    const form = new FormData()
    form.append('file', new Blob([JSON.stringify(ownerBackup)], { type: 'application/json' }), 'sauvegarde.json')
    const restoreRes = await fetch(`${baseUrl}/api/backup/restore`, { method: 'POST', headers: { Cookie: ownerCookie }, body: form })
    expect(restoreRes.status).toBe(200)

    const ressourceList = await (await fetch(`${baseUrl}/api/students`, authed(ressource.cookie))).json()
    expect(ressourceList).toHaveLength(1)
    expect(ressourceList[0].name).toBe('Eleve de la ressource')

    const ownerList = await (await fetch(`${baseUrl}/api/students`, authed(ownerCookie))).json()
    expect(ownerList).toHaveLength(1)
    expect(ownerList[0].name).toBe('Léa Tremblay')
  })
})

describe('compte proprietaire : gestion des comptes/reseau/assignations reservee', () => {
  it("un compte enseignant non-proprietaire recoit 403 sur la gestion des comptes, le reseau et les assignations", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })

    const createEaRes = await createEA(baseUrl, ressource.cookie)
    expect(createEaRes.status).toBe(403)

    const createEnsRes = await createEnseignant(baseUrl, ressource.cookie, { username: 'autre' })
    expect(createEnsRes.status).toBe(403)

    const networkGet = await fetch(`${baseUrl}/api/network-settings`, authed(ressource.cookie))
    expect(networkGet.status).toBe(403)

    const networkPost = await fetch(`${baseUrl}/api/network-settings`, authed(ressource.cookie, { method: 'POST', body: JSON.stringify({ lanSharingEnabled: true }) }))
    expect(networkPost.status).toBe(403)

    const assignRes = await createAssignmentGrant(baseUrl, ressource.cookie, 'ressource', 'prof')
    expect(assignRes.status).toBe(403)
  })

  it("le compte proprietaire garde tous ces droits", async () => {
    const createEaRes = await createEA(baseUrl, ownerCookie)
    expect(createEaRes.status).toBe(201)

    const networkGet = await fetch(`${baseUrl}/api/network-settings`, authed(ownerCookie))
    expect(networkGet.status).toBe(200)
  })

  it("la lecture des comptes et des assignations reste ouverte aux deux", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const ressource = await login(baseUrl, { username: 'ressource', password: 'test1234', role: 'enseignant' })
    await createAssignmentGrant(baseUrl, ownerCookie, 'ressource', 'prof')

    const accountsAsOwner = await fetch(`${baseUrl}/api/auth/accounts`, authed(ownerCookie))
    expect(accountsAsOwner.status).toBe(200)
    const accountsAsResource = await fetch(`${baseUrl}/api/auth/accounts`, authed(ressource.cookie))
    expect(accountsAsResource.status).toBe(200)

    const assignmentsAsResource = await fetch(`${baseUrl}/api/auth/assignments`, authed(ressource.cookie))
    expect(assignmentsAsResource.status).toBe(200)
    const body = await assignmentsAsResource.json()
    expect(body).toHaveLength(1)
    expect(body[0].resourceUsername).toBe('ressource')
    expect(body[0].ownerUsername).toBe('prof')
  })

  it("le compte du tout premier enseignant est marque proprietaire, le second ne l'est pas", async () => {
    await createEnseignant(baseUrl, ownerCookie)
    const accounts = await (await fetch(`${baseUrl}/api/auth/accounts`, authed(ownerCookie))).json()
    const owner = accounts.find((a) => a.username === 'prof')
    const collaborator = accounts.find((a) => a.username === 'ressource')
    expect(owner.isOwner).toBe(true)
    expect(collaborator.isOwner).toBe(false)
  })
})
