// Utilitaires partages entre les fichiers de test d'integration (routes API
// contre un vrai serveur demarre sur un port libre, voir tests/setup.js pour
// l'isolation de la base de donnees).

export function cookieFrom(res) {
  const raw = res.headers.get('set-cookie')
  return raw ? raw.split(';')[0] : null
}

export async function setupTeacher(baseUrl, overrides = {}) {
  const res = await fetch(`${baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'prof',
      password: 'test1234',
      nomComplet: 'Baudouin Mandan',
      courriel: 'prof@ecole.ca',
      ...overrides,
    }),
  })
  return { res, cookie: cookieFrom(res) }
}

export async function login(baseUrl, { username, password, role }) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  })
  return { res, cookie: cookieFrom(res) }
}

export async function createEA(baseUrl, teacherCookie, overrides = {}) {
  const res = await fetch(`${baseUrl}/api/auth/create-ea`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ username: 'assistant', password: 'test1234', ...overrides }),
  })
  return res
}

export async function createEnseignant(baseUrl, teacherCookie, overrides = {}) {
  const res = await fetch(`${baseUrl}/api/auth/create-enseignant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ username: 'ressource', password: 'test1234', nomComplet: 'Nadia Ressource', ...overrides }),
  })
  return res
}

export async function createAssignmentGrant(baseUrl, ownerCookie, resourceUsername, ownerUsername) {
  const res = await fetch(`${baseUrl}/api/auth/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ resourceUsername, ownerUsername }),
  })
  return res
}
