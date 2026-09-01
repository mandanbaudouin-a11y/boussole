import PDFDocument from 'pdfkit'
import path from 'path'
import { fileURLToPath } from 'url'
import { GOAL_STATUS_LABELS, STRATEGY_CATEGORY_LABELS, ADAPTATION_SUBTYPE_LABELS, MODIFICATION_TYPE_LABELS } from './db.js'
import { t } from './i18nEn.js'

// Rapport PEI en PDF. Le rendu est fait à la main avec PDFKit (plutôt que
// puppeteer/playwright) pour éviter d'embarquer un second Chromium dans une
// app déjà packagée avec Electron. La police DejaVu Sans est intégrée
// explicitement (voir server/assets/fonts/LICENSE.txt) car les accents
// français et le œ ne sont pas garantis avec les polices système par défaut
// selon la plateforme d'impression/export.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_REGULAR = path.join(__dirname, 'assets', 'fonts', 'DejaVuSans.ttf')
const FONT_BOLD = path.join(__dirname, 'assets', 'fonts', 'DejaVuSans-Bold.ttf')
const LOGO_ICON = path.join(__dirname, 'assets', 'logo', 'icon.png')
const LOGO_ECOLE = path.join(__dirname, 'assets', 'logo', 'ecole-riviere-rouge.png')

function reviewDaysLabel(days, lang) {
  const n = Math.abs(days)
  if (lang === 'en') {
    if (days < 0) return `overdue by ${n} day${n > 1 ? 's' : ''}`
    if (days === 0) return 'today'
    return `in ${days} day${days > 1 ? 's' : ''}`
  }
  if (days < 0) return `en retard de ${n} jour${n > 1 ? 's' : ''}`
  if (days === 0) return "aujourd'hui"
  return `dans ${days} jour${days > 1 ? 's' : ''}`
}

function formatDateLocalized(dateStr, lang) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
}

const COLORS = {
  ink: '#1E2A38',
  inkSoft: '#5B6B63',
  chalk: '#2F5D50',
  border: '#D8DCD6',
  status: {
    non_atteint: { bg: '#F7E3DB', fg: '#C1502E' },
    en_progres: { bg: '#FBEED9', fg: '#7A5312' },
    atteint: { bg: '#DCE6E1', fg: '#2F5D50' },
    depasse: { bg: '#DCE8EE', fg: '#3B6E8F' },
  },
  alertWarning: { bg: '#FBEED9', fg: '#7A5312' },
  alertUrgent: { bg: '#F7E3DB', fg: '#C1502E' },
  category: { bg: '#EEF1EC', fg: '#5B6B63' },
}

function reportSummaryText(student, lang) {
  if (student.narrativeReport && student.narrativeReport.trim()) {
    return student.narrativeReport.trim()
  }

  const doneCount = student.goals.filter((g) => g.done).length
  const hasWeeklyRate = student.weeklyRate.length > 0
  const firstName = student.name.split(' ')[0]

  if (lang === 'en') {
    if (!hasWeeklyRate) {
      return `No weekly history is available yet for ${firstName}. Today, ${doneCount} of ${student.goals.length} goal${student.goals.length > 1 ? 's' : ''} ${doneCount > 1 ? 'have' : 'has'} been marked as achieved.`
    }
    const avgRate = Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    const firstRate = student.weeklyRate[0].pct
    const lastRate = student.weeklyRate[student.weeklyRate.length - 1].pct
    return (
      `Over the last ${student.weeklyRate.length} weeks, ${firstName} reached an average success rate ` +
      `of ${avgRate}% across all active goals in their IEP. Today, ${doneCount} of ${student.goals.length} goal${student.goals.length > 1 ? 's' : ''} ${doneCount > 1 ? 'have' : 'has'} been marked as achieved. The weekly ` +
      `trend is ${lastRate >= firstRate ? 'trending up' : 'stable'}, moving ` +
      `from ${firstRate}% in week 1 to ${lastRate}% in week ${student.weeklyRate.length}.`
    )
  }

  if (!hasWeeklyRate) {
    return `Aucun historique hebdomadaire n'est encore disponible pour ${firstName}. Aujourd'hui, ${doneCount} objectif${doneCount > 1 ? 's' : ''} sur ${student.goals.length} ${doneCount > 1 ? 'ont' : 'a'} été coché${doneCount > 1 ? 's' : ''} comme atteint${doneCount > 1 ? 's' : ''}.`
  }

  const avgRate = Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
  const firstRate = student.weeklyRate[0].pct
  const lastRate = student.weeklyRate[student.weeklyRate.length - 1].pct

  return (
    `Sur les ${student.weeklyRate.length} dernières semaines, ${firstName} a atteint un taux moyen de ` +
    `réussite de ${avgRate}% sur l'ensemble des objectifs actifs de son PEI. Aujourd'hui, ${doneCount} objectif${doneCount > 1 ? 's' : ''} sur ${student.goals.length} ${doneCount > 1 ? 'ont' : 'a'} été coché${doneCount > 1 ? 's' : ''} comme atteint${doneCount > 1 ? 's' : ''}. La tendance ` +
    `hebdomadaire est ${lastRate >= firstRate ? 'à la hausse' : 'stable'}, passant ` +
    `de ${firstRate}% en semaine 1 à ${lastRate}% en semaine ${student.weeklyRate.length}.`
  )
}

function sectionTitle(doc, text) {
  doc.moveDown(0.9)
  doc.x = doc.page.margins.left
  doc.font('bold').fontSize(10).fillColor(COLORS.inkSoft).text(text.toUpperCase(), { characterSpacing: 0.4 })
  doc.moveDown(0.4)
}

function ruleAt(doc, y) {
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(COLORS.border)
    .lineWidth(0.75)
    .stroke()
}

function drawPill(doc, text, x, y, { bg, fg, font = 'bold', fontSize = 8 }) {
  doc.font(font).fontSize(fontSize)
  const paddingX = 7
  const width = doc.widthOfString(text) + paddingX * 2
  const height = fontSize + 8
  doc.roundedRect(x, y, width, height, height / 2).fill(bg)
  doc.fillColor(fg).text(text, x + paddingX, y + height / 2 - fontSize / 2 + 0.5, { lineBreak: false })
  // L'appel de texte ci-dessus laisse doc.x proche de la marge de droite ;
  // sans ce reset, tout .text() suivant sans position explicite hérite de ce
  // curseur et se retrouve enroulé caractère par caractère dans une colonne
  // quasi nulle (bug déjà rencontré deux fois — voir sectionTitle()).
  doc.x = doc.page.margins.left
  return width
}

function drawStrategyChips(doc, strategies, startX, startY, maxWidth, lang) {
  let x = startX
  let y = startY
  const gap = 6
  const rowHeight = 22

  for (const s of strategies) {
    doc.font('regular').fontSize(9)
    const categoryLabel = s.category ? t(STRATEGY_CATEGORY_LABELS[s.category], lang) : null
    const label = categoryLabel ? `${categoryLabel}  ${s.label}` : s.label
    const chipWidth = doc.widthOfString(label) + 16 + (s.category ? 4 : 0)

    if (x !== startX && x + chipWidth > startX + maxWidth) {
      x = startX
      y += rowHeight + gap
    }

    doc.roundedRect(x, y, chipWidth, rowHeight, 4).fillAndStroke('#FFFFFF', COLORS.border)
    let textX = x + 8
    if (categoryLabel) {
      doc
        .font('bold')
        .fontSize(7.5)
        .fillColor(COLORS.category.fg)
        .text(categoryLabel.toUpperCase(), textX, y + 7, { lineBreak: false, characterSpacing: 0.3 })
      textX += doc.widthOfString(categoryLabel.toUpperCase()) + 6
    }
    doc.font('regular').fontSize(9).fillColor(COLORS.ink).text(s.label, textX, y + 6.5, { lineBreak: false })

    x += chipWidth + gap
  }

  return y + rowHeight
}

function renderStudent(doc, student, { ecole, divisionScolaire, generatedBy, lang = 'fr' }) {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

  const logoSize = 26
  const ecoleLogoSize = 30
  const cursorX = doc.x
  const cursorY = doc.y
  doc.image(LOGO_ECOLE, cursorX, cursorY - 3, { width: ecoleLogoSize, height: ecoleLogoSize })
  doc.image(LOGO_ICON, doc.page.width - doc.page.margins.right - logoSize, cursorY - 3, { width: logoSize, height: logoSize })
  doc.x = cursorX
  doc.y = cursorY

  const headerTextX = cursorX + ecoleLogoSize + 10
  const headerTextWidth = contentWidth - ecoleLogoSize - 10 - logoSize - 12
  const headerLine = (ecole || t('École non précisée', lang)).toUpperCase() + (divisionScolaire ? `  ·  ${divisionScolaire.toUpperCase()}` : '')
  doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text(headerLine, headerTextX, cursorY, { width: headerTextWidth, characterSpacing: 0.5 })
  const reportLine =
    lang === 'en'
      ? `Progress report — IEP · Generated on ${today}${generatedBy ? ' by ' + generatedBy : ''}`
      : `Rapport de progrès — PEI · Généré le ${today}${generatedBy ? ' par ' + generatedBy : ''}`
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLORS.inkSoft)
    .text(reportLine, headerTextX, doc.y, { width: headerTextWidth })
  doc.x = cursorX
  if (doc.y < cursorY + ecoleLogoSize) doc.y = cursorY + ecoleLogoSize
  doc.moveDown(0.5)
  ruleAt(doc, doc.y)
  doc.moveDown(0.9)

  doc.font('bold').fontSize(19).fillColor(COLORS.chalk).text(`${student.name} — ${student.grade}`)
  doc.moveDown(0.6)

  const doneCount = student.goals.filter((g) => g.done).length
  const avgRate = student.weeklyRate.length
    ? Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    : 0
  const statsLine =
    lang === 'en'
      ? `Average rate: ${avgRate}%    ·    Active goals: ${student.goals.length}    ·    Achieved today: ${doneCount}/${student.goals.length}`
      : `Taux moyen : ${avgRate}%    ·    Objectifs actifs : ${student.goals.length}    ·    Atteints aujourd'hui : ${doneCount}/${student.goals.length}`
  doc.font('regular').fontSize(10).fillColor(COLORS.inkSoft).text(statsLine)

  if (student.forces || student.besoins) {
    sectionTitle(doc, t('Forces et besoins', lang))
    if (student.forces) {
      doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text(t('FORCES', lang), { characterSpacing: 0.3 })
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(student.forces, { lineGap: 3 })
      doc.moveDown(0.4)
    }
    if (student.besoins) {
      doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text(t('BESOINS', lang), { characterSpacing: 0.3 })
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(student.besoins, { lineGap: 3 })
    }
  }

  if (student.adaptations && student.adaptations.length > 0) {
    sectionTitle(doc, t('Adaptations', lang))
    student.adaptations.forEach((a, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      const subtypeLabel = t(ADAPTATION_SUBTYPE_LABELS[a.subtype] || a.subtype, lang)
      doc.font('bold').fontSize(8.5)
      const pillWidth = doc.widthOfString(subtypeLabel) + 14
      const lineY = doc.y
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(a.description, doc.page.margins.left, lineY, {
        width: contentWidth - pillWidth - 10,
      })
      const descBottom = doc.y
      drawPill(doc, subtypeLabel, doc.page.width - doc.page.margins.right - pillWidth, lineY - 1, {
        bg: COLORS.category.bg,
        fg: COLORS.category.fg,
      })
      doc.y = Math.max(descBottom, lineY + 18)
      if (a.goalLabel) {
        const linked = lang === 'en' ? `${t('Liée à l\'objectif', lang)}: ${a.goalLabel}` : `Liée à l'objectif : ${a.goalLabel}`
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(linked)
      }
      doc.moveDown(0.3)
    })
  }

  if (student.modifications && student.modifications.length > 0) {
    sectionTitle(doc, t('Modifications', lang))
    student.modifications.forEach((m, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      const typeLabel = t(MODIFICATION_TYPE_LABELS[m.type] || m.type, lang)
      doc.font('bold').fontSize(8.5)
      const pillWidth = doc.widthOfString(typeLabel) + 14
      const lineY = doc.y
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(m.description, doc.page.margins.left, lineY, {
        width: contentWidth - pillWidth - 10,
      })
      const descBottom = doc.y
      drawPill(doc, typeLabel, doc.page.width - doc.page.margins.right - pillWidth, lineY - 1, {
        bg: COLORS.category.bg,
        fg: COLORS.category.fg,
      })
      doc.y = Math.max(descBottom, lineY + 18)
      const subjectLine = lang === 'en' ? `${t('Matière', lang)}: ${m.subject}` : `Matière : ${m.subject}`
      doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(subjectLine)
      doc.moveDown(0.3)
    })
  }

  if (student.transitionGoals && student.transitionGoals.length > 0) {
    sectionTitle(doc, t('Plan de transition', lang))
    student.transitionGoals.forEach((g, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      doc.font('bold').fontSize(10.5).fillColor(COLORS.ink).text(g.description)

      const metaParts = []
      if (g.responsible) {
        metaParts.push(lang === 'en' ? `${t('Responsable', lang)}: ${g.responsible}` : `Responsable : ${g.responsible}`)
      }
      if (g.targetDate) {
        const dateLabel = formatDateLocalized(g.targetDate, lang)
        metaParts.push(lang === 'en' ? `${t('Délai prévu', lang)}: ${dateLabel}` : `Délai prévu : ${dateLabel}`)
      }
      if (metaParts.length > 0) {
        doc.moveDown(0.15)
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(metaParts.join('    ·    '))
      }
      if (g.communityResources) {
        doc.moveDown(0.1)
        const resLine = lang === 'en' ? `${t('Ressources communautaires', lang)}: ${g.communityResources}` : `Ressources communautaires : ${g.communityResources}`
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(resLine)
      }
      if (g.steps && g.steps.length > 0) {
        doc.moveDown(0.25)
        g.steps.forEach((s) => {
          doc.font('regular').fontSize(9.5).fillColor(COLORS.ink).text(`•  ${s.description}`, {
            width: contentWidth - 10,
          })
        })
      }
      doc.moveDown(0.3)
    })
  }

  sectionTitle(doc, t('Résumé', lang))
  doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(reportSummaryText(student, lang), { lineGap: 3 })

  sectionTitle(doc, t('Objectifs suivis', lang))
  student.goals.forEach((goal, i) => {
    if (i > 0) ruleAt(doc, doc.y)
    doc.moveDown(0.5)

    const status = COLORS.status[goal.status] || COLORS.status.non_atteint
    const statusLabel = t(GOAL_STATUS_LABELS[goal.status] || goal.status, lang)
    doc.font('bold').fontSize(8.5)
    const pillWidth = doc.widthOfString(statusLabel) + 14
    const lineY = doc.y

    doc.font('regular').fontSize(11).fillColor(COLORS.ink).text(goal.label, doc.page.margins.left, lineY, {
      width: contentWidth - pillWidth - 10,
    })
    const labelBottom = doc.y
    drawPill(doc, statusLabel, doc.page.width - doc.page.margins.right - pillWidth, lineY - 1, {
      bg: status.bg,
      fg: status.fg,
    })

    doc.y = Math.max(labelBottom, lineY + 18)

    if (goal.strategies && goal.strategies.length > 0) {
      doc.moveDown(0.3)
      const endY = drawStrategyChips(doc, goal.strategies, doc.page.margins.left, doc.y, contentWidth, lang)
      doc.y = endY
    }
    doc.moveDown(0.4)
  })

  if (student.notes.length > 0) {
    sectionTitle(doc, t("Notes de l'enseignant", lang))
    student.notes.forEach((note) => {
      doc
        .font('bold')
        .fontSize(9)
        .fillColor(COLORS.inkSoft)
        .text(note.date, doc.page.margins.left, doc.y, { continued: false, width: 70 })
      const dateBottom = doc.y
      doc
        .font('regular')
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(note.text, doc.page.margins.left + 80, dateBottom - doc.currentLineHeight(), {
          width: contentWidth - 80,
        })
      doc.moveDown(0.4)
    })
  }

  doc.moveDown(0.6)
  const alertText =
    lang === 'en'
      ? `Next IEP review ${reviewDaysLabel(student.reviewInDays, lang)} — add to the agenda of the parent-school meeting.`
      : `Prochaine révision du PEI ${reviewDaysLabel(student.reviewInDays, lang)} — à inscrire à l'ordre du jour de la rencontre parents-école.`
  const alertColors = student.reviewInDays <= 7 ? COLORS.alertUrgent : COLORS.alertWarning
  const alertY = doc.y
  doc.font('regular').fontSize(9.5)
  const alertHeight = doc.heightOfString(alertText, { width: contentWidth - 24 }) + 16
  doc.roundedRect(doc.page.margins.left, alertY, contentWidth, alertHeight, 6).fill(alertColors.bg)
  doc
    .fillColor(alertColors.fg)
    .text(alertText, doc.page.margins.left + 12, alertY + 8, { width: contentWidth - 24 })
}

function registerFonts(doc) {
  doc.registerFont('regular', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('regular')
}

export function streamStudentReportPdf(res, student, options) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  registerFonts(doc)
  res.setHeader('Content-Type', 'application/pdf')
  const filename = `rapport-pei-${student.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  renderStudent(doc, student, options)
  doc.end()
}

export function streamCombinedReportPdf(res, students, options) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  registerFonts(doc)
  res.setHeader('Content-Type', 'application/pdf')
  const filename = `rapports-pei-classe-${new Date().toISOString().slice(0, 10)}.pdf`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  students.forEach((student, i) => {
    if (i > 0) doc.addPage()
    renderStudent(doc, student, options)
  })
  doc.end()
}
