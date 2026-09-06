import { describe, it, expect } from 'vitest'
import { sameContent, stripVolatileFields } from '../src/reportChangeDetection.js'

function baseStudent(overrides = {}) {
  return {
    id: 's1',
    name: 'Léa Tremblay',
    grade: '2e année',
    nextReviewDate: '2026-10-01',
    reviewInDays: 25,
    birthdate: '2018-01-01',
    age: 8,
    forces: 'Curieuse',
    besoins: null,
    adaptations: [],
    modifications: [],
    consultationDate: null,
    consultationMethod: null,
    copyDeliveryDate: null,
    acknowledgmentStatus: null,
    deliveredVersionId: null,
    copyDeliveryOverdue: false,
    goals: [{ id: 'g1', label: 'Lire 10 min/jour', status: 'en_progres', strategies: [] }],
    notes: [],
    narrativeReport: null,
    narrativeReportUpdatedAt: null,
    ...overrides,
  }
}

describe('stripVolatileFields', () => {
  it('retire les champs calcules a partir de la date du jour et le suivi de remise', () => {
    const stripped = stripVolatileFields(baseStudent())
    expect(stripped).not.toHaveProperty('reviewInDays')
    expect(stripped).not.toHaveProperty('age')
    expect(stripped).not.toHaveProperty('copyDeliveryOverdue')
    expect(stripped).not.toHaveProperty('deliveredVersionId')
    expect(stripped).not.toHaveProperty('narrativeReportUpdatedAt')
    expect(stripped.name).toBe('Léa Tremblay')
  })
})

describe('sameContent', () => {
  it('considere deux instantanes identiques comme identiques', () => {
    expect(sameContent(baseStudent(), baseStudent())).toBe(true)
  })

  it("ignore le simple ecoulement du temps (reviewInDays, age qui diminuent sans vraie modification)", () => {
    const today = baseStudent({ reviewInDays: 25, age: 8 })
    const tomorrow = baseStudent({ reviewInDays: 24, age: 8 })
    expect(sameContent(today, tomorrow)).toBe(true)
  })

  it("ignore le fait qu'une version soit marquee comme remise a un parent", () => {
    const before = baseStudent({ deliveredVersionId: null, copyDeliveryOverdue: true })
    const after = baseStudent({ deliveredVersionId: 3, copyDeliveryOverdue: false })
    expect(sameContent(before, after)).toBe(true)
  })

  it("ignore le suivi de consultation/remise, jamais imprime dans le rapport PDF", () => {
    const before = baseStudent({ consultationDate: null, copyDeliveryDate: null, acknowledgmentStatus: null })
    const after = baseStudent({ consultationDate: '2026-09-10', copyDeliveryDate: '2026-09-15', acknowledgmentStatus: 'recu' })
    expect(sameContent(before, after)).toBe(true)
  })

  it('detecte un vrai changement de contenu (nouvel objectif)', () => {
    const before = baseStudent()
    const after = baseStudent({
      goals: [
        { id: 'g1', label: 'Lire 10 min/jour', status: 'en_progres', strategies: [] },
        { id: 'g2', label: 'Nouvel objectif', status: 'non_atteint', strategies: [] },
      ],
    })
    expect(sameContent(before, after)).toBe(false)
  })

  it('detecte un changement de statut sur un objectif existant', () => {
    const before = baseStudent()
    const after = baseStudent({ goals: [{ id: 'g1', label: 'Lire 10 min/jour', status: 'atteint', strategies: [] }] })
    expect(sameContent(before, after)).toBe(false)
  })

  it('detecte un changement de forces/besoins', () => {
    const before = baseStudent({ besoins: null })
    const after = baseStudent({ besoins: "Plus de temps pour les transitions" })
    expect(sameContent(before, after)).toBe(false)
  })
})
