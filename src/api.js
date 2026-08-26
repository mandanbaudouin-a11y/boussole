async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const error = new Error(body.error || `Erreur ${res.status}`)
    if (res.status === 401) error.authRequired = true
    throw error
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  getStudents: () => request('/students'),

  createStudent: (data) => request('/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id, data) => request(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStudent: (id) => request(`/students/${id}`, { method: 'DELETE' }),

  createGoal: (studentId, label) =>
    request(`/students/${studentId}/goals`, { method: 'POST', body: JSON.stringify({ label }) }),
  updateGoal: (goalId, data) => request(`/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteGoal: (goalId) => request(`/goals/${goalId}`, { method: 'DELETE' }),

  createNote: (studentId, text) =>
    request(`/students/${studentId}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),

  getAiStatus: () => request('/ai/status'),
  setActiveAiProvider: (provider) =>
    request('/ai/active-provider', { method: 'POST', body: JSON.stringify({ provider }) }),
  saveAiApiKey: (provider, apiKey) =>
    request(`/ai/providers/${provider}/key`, { method: 'POST', body: JSON.stringify({ apiKey }) }),
  clearAiApiKey: (provider) => request(`/ai/providers/${provider}/key`, { method: 'DELETE' }),
  generateAiReport: (studentId, lang = 'fr') =>
    request(`/students/${studentId}/ai-report`, { method: 'POST', body: JSON.stringify({ lang }) }),
  saveNarrativeReport: (studentId, text) =>
    request(`/students/${studentId}/narrative-report`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  suggestFieldText: (studentId, field, draft, lang = 'fr') =>
    request(`/students/${studentId}/suggest-text`, { method: 'POST', body: JSON.stringify({ field, draft, lang }) }),

  getStrategiesLibrary: () => request('/strategies-library'),
  addStrategy: (goalId, label, category) =>
    request(`/goals/${goalId}/strategies`, { method: 'POST', body: JSON.stringify({ label, category }) }),
  deleteStrategy: (strategyId) => request(`/strategies/${strategyId}`, { method: 'DELETE' }),

  addAdaptation: (studentId, data) =>
    request(`/students/${studentId}/adaptations`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAdaptation: (adaptationId) => request(`/adaptations/${adaptationId}`, { method: 'DELETE' }),
  addModification: (studentId, data) =>
    request(`/students/${studentId}/modifications`, { method: 'POST', body: JSON.stringify(data) }),
  deleteModification: (modificationId) => request(`/modifications/${modificationId}`, { method: 'DELETE' }),

  addTransitionGoal: (studentId, data) =>
    request(`/students/${studentId}/transition-goals`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTransitionGoal: (goalId) => request(`/transition-goals/${goalId}`, { method: 'DELETE' }),
  addTransitionStep: (goalId, description) =>
    request(`/transition-goals/${goalId}/steps`, { method: 'POST', body: JSON.stringify({ description }) }),
  deleteTransitionStep: (stepId) => request(`/transition-steps/${stepId}`, { method: 'DELETE' }),

  extractImport: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/import/extract', { method: 'POST', body: formData })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(body.error || `Erreur ${res.status}`)
      if (res.status === 401) error.authRequired = true
      throw error
    }
    return body
  },

  downloadBackup: async () => {
    const res = await fetch('/api/backup/export')
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const error = new Error(body.error || `Erreur ${res.status}`)
      if (res.status === 401) error.authRequired = true
      throw error
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : 'pei-central-sauvegarde.json'
    return { blob, filename }
  },

  downloadStudentReportPdf: async (studentId, lang = 'fr') => {
    const res = await fetch(`/api/students/${studentId}/report.pdf?lang=${lang}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const error = new Error(body.error || `Erreur ${res.status}`)
      if (res.status === 401) error.authRequired = true
      throw error
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : 'rapport-pei.pdf'
    return { blob, filename }
  },

  downloadCombinedReportPdf: async (lang = 'fr') => {
    const res = await fetch(`/api/reports/pdf?lang=${lang}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const error = new Error(body.error || `Erreur ${res.status}`)
      if (res.status === 401) error.authRequired = true
      throw error
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : 'rapports-pei-classe.pdf'
    return { blob, filename }
  },

  restoreBackup: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/backup/restore', { method: 'POST', body: formData })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(body.error || `Erreur ${res.status}`)
      if (res.status === 401) error.authRequired = true
      throw error
    }
    return body
  },
}
