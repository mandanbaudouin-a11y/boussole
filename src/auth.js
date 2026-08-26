async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erreur ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const auth = {
  status: () => request('/auth/status'),
  setup: (username, password, profile) =>
    request('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password, ...profile }) }),
  login: (username, password, role) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, role }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  listAccounts: () => request('/auth/accounts'),
  createEaAccount: (username, password) =>
    request('/auth/create-ea', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getProfile: () => request('/auth/profile'),
  updateProfile: (data) => request('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),
}
