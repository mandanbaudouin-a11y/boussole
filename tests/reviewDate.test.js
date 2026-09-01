import { describe, it, expect } from 'vitest'
import { reviewDaysLabel, defaultNextReviewDate } from '../src/reviewDate.js'

describe('reviewDaysLabel', () => {
  // Le traducteur par defaut (`t = (s) => s`, quand aucun n'est fourni) ne
  // fait AUCUNE interpolation : sans traducteur reel, on recupere donc le
  // gabarit brut avec {n} non substitue — c'est le traducteur de
  // useLanguage() qui fait l'interpolation en pratique.
  it("aujourd'hui pour 0 jour", () => {
    expect(reviewDaysLabel(0)).toBe("aujourd'hui")
  })

  it('choisit le singulier pour 1 jour de retard (gabarit brut sans traducteur)', () => {
    expect(reviewDaysLabel(-1)).toBe('en retard de {n} jour')
  })

  it('choisit le pluriel pour plusieurs jours de retard (gabarit brut sans traducteur)', () => {
    expect(reviewDaysLabel(-6)).toBe('en retard de {n} jours')
  })

  it('choisit le singulier pour dans 1 jour (gabarit brut sans traducteur)', () => {
    expect(reviewDaysLabel(1)).toBe('dans {n} jour')
  })

  it('choisit le pluriel pour dans plusieurs jours (gabarit brut sans traducteur)', () => {
    expect(reviewDaysLabel(4)).toBe('dans {n} jours')
  })

  it('avec un vrai traducteur (interpolation), le nombre est substitue', () => {
    const t = (key, vars) => `${key}::${JSON.stringify(vars || {})}`
    expect(reviewDaysLabel(-6, t)).toBe('en retard de {n} jours::{"n":6}')
    expect(reviewDaysLabel(0, t)).toBe(`aujourd'hui::{}`)
  })
})

describe('defaultNextReviewDate', () => {
  it('renvoie une date au format AAAA-MM-JJ, 30 jours dans le futur', () => {
    const result = defaultNextReviewDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const expected = new Date()
    expected.setDate(expected.getDate() + 30)
    const y = expected.getFullYear()
    const m = String(expected.getMonth() + 1).padStart(2, '0')
    const d = String(expected.getDate()).padStart(2, '0')
    expect(result).toBe(`${y}-${m}-${d}`)
  })
})
