import { describe, it, expect } from 'vitest'
import { lastBackupLabel } from '../src/lastBackup.js'

function daysAgoIso(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

describe('lastBackupLabel', () => {
  it('indique qu\'aucune sauvegarde n\'a ete faite quand il n\'y a pas de date', () => {
    expect(lastBackupLabel(null)).toBe('Aucune sauvegarde effectuée')
    expect(lastBackupLabel(undefined)).toBe('Aucune sauvegarde effectuée')
  })

  it('traite une date invalide comme "aucune sauvegarde"', () => {
    expect(lastBackupLabel('pas-une-date')).toBe('Aucune sauvegarde effectuée')
  })

  it("aujourd'hui pour une sauvegarde du jour meme", () => {
    expect(lastBackupLabel(daysAgoIso(0))).toBe("Dernière sauvegarde : aujourd'hui")
  })

  it('hier pour une sauvegarde d\'hier', () => {
    expect(lastBackupLabel(daysAgoIso(1))).toBe('Dernière sauvegarde : hier')
  })

  it('nombre de jours pour une sauvegarde plus ancienne (gabarit brut sans traducteur)', () => {
    // Comme reviewDaysLabel, le traducteur par defaut ne fait pas
    // d'interpolation : {n} n'est substitue que par un vrai traducteur
    // (voir le test suivant).
    expect(lastBackupLabel(daysAgoIso(3))).toBe('Dernière sauvegarde : il y a {n} jours')
  })

  it('utilise le traducteur fourni avec les variables attendues', () => {
    const t = (key, vars) => `${key}::${JSON.stringify(vars || {})}`
    expect(lastBackupLabel(daysAgoIso(5), t)).toBe('Dernière sauvegarde : il y a {n} jours::{"n":5}')
  })
})
