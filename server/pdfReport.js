import PDFDocument from 'pdfkit'
import path from 'path'
import { fileURLToPath } from 'url'
import { GOAL_STATUS_LABELS, STRATEGY_CATEGORY_LABELS, ADAPTATION_SUBTYPE_LABELS, MODIFICATION_TYPE_LABELS } from './db.js'

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

function reviewDaysLabel(days) {
  if (days < 0) return `en retard de ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`
  if (days === 0) return "aujourd'hui"
  return `dans ${days} jour${days > 1 ? 's' : ''}`
}

function formatDateFr(dateStr) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
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

function reportSummaryText(student) {
  if (student.narrativeReport && student.narrativeReport.trim()) {
    return student.narrativeReport.trim()
  }

  const doneCount = student.goals.filter((g) => g.done).length
  const hasWeeklyRate = student.weeklyRate.length > 0
  const firstName = student.name.split(' ')[0]

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

function drawStrategyChips(doc, strategies, startX, startY, maxWidth) {
  let x = startX
  let y = startY
  const gap = 6
  const rowHeight = 22

  for (const s of strategies) {
    doc.font('regular').fontSize(9)
    const label = s.category ? `${STRATEGY_CATEGORY_LABELS[s.category]}  ${s.label}` : s.label
    const chipWidth = doc.widthOfString(label) + 16 + (s.category ? 4 : 0)

    if (x !== startX && x + chipWidth > startX + maxWidth) {
      x = startX
      y += rowHeight + gap
    }

    doc.roundedRect(x, y, chipWidth, rowHeight, 4).fillAndStroke('#FFFFFF', COLORS.border)
    let textX = x + 8
    if (s.category) {
      doc
        .font('bold')
        .fontSize(7.5)
        .fillColor(COLORS.category.fg)
        .text(STRATEGY_CATEGORY_LABELS[s.category].toUpperCase(), textX, y + 7, { lineBreak: false, characterSpacing: 0.3 })
      textX += doc.widthOfString(STRATEGY_CATEGORY_LABELS[s.category].toUpperCase()) + 6
    }
    doc.font('regular').fontSize(9).fillColor(COLORS.ink).text(s.label, textX, y + 6.5, { lineBreak: false })

    x += chipWidth + gap
  }

  return y + rowHeight
}

function renderStudent(doc, student, { ecole, divisionScolaire, generatedBy }) {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const today = new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })

  const logoSize = 26
  const cursorX = doc.x
  const cursorY = doc.y
  doc.image(LOGO_ICON, doc.page.width - doc.page.margins.right - logoSize, cursorY - 3, { width: logoSize, height: logoSize })
  doc.x = cursorX
  doc.y = cursorY

  const headerLine = (ecole || 'École non précisée').toUpperCase() + (divisionScolaire ? `  ·  ${divisionScolaire.toUpperCase()}` : '')
  doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text(headerLine, { width: contentWidth - logoSize - 12, characterSpacing: 0.5 })
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLORS.inkSoft)
    .text(`Rapport de progrès — PEI · Généré le ${today}${generatedBy ? ' par ' + generatedBy : ''}`, { width: contentWidth - logoSize - 12 })
  doc.moveDown(0.5)
  ruleAt(doc, doc.y)
  doc.moveDown(0.9)

  doc.font('bold').fontSize(19).fillColor(COLORS.chalk).text(`${student.name} — ${student.grade}`)
  doc.moveDown(0.6)

  const doneCount = student.goals.filter((g) => g.done).length
  const avgRate = student.weeklyRate.length
    ? Math.round(student.weeklyRate.reduce((sum, w) => sum + w.pct, 0) / student.weeklyRate.length)
    : 0
  doc
    .font('regular')
    .fontSize(10)
    .fillColor(COLORS.inkSoft)
    .text(
      `Taux moyen : ${avgRate}%    ·    Objectifs actifs : ${student.goals.length}    ·    Atteints aujourd'hui : ${doneCount}/${student.goals.length}`
    )

  if (student.forces || student.besoins) {
    sectionTitle(doc, 'Forces et besoins')
    if (student.forces) {
      doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text('FORCES', { characterSpacing: 0.3 })
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(student.forces, { lineGap: 3 })
      doc.moveDown(0.4)
    }
    if (student.besoins) {
      doc.font('bold').fontSize(9).fillColor(COLORS.inkSoft).text('BESOINS', { characterSpacing: 0.3 })
      doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(student.besoins, { lineGap: 3 })
    }
  }

  if (student.adaptations && student.adaptations.length > 0) {
    sectionTitle(doc, 'Adaptations')
    student.adaptations.forEach((a, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      const subtypeLabel = ADAPTATION_SUBTYPE_LABELS[a.subtype] || a.subtype
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
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(`Liée à l'objectif : ${a.goalLabel}`)
      }
      doc.moveDown(0.3)
    })
  }

  if (student.modifications && student.modifications.length > 0) {
    sectionTitle(doc, 'Modifications')
    student.modifications.forEach((m, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      const typeLabel = MODIFICATION_TYPE_LABELS[m.type] || m.type
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
      doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(`Matière : ${m.subject}`)
      doc.moveDown(0.3)
    })
  }

  if (student.transitionGoals && student.transitionGoals.length > 0) {
    sectionTitle(doc, 'Plan de transition')
    student.transitionGoals.forEach((g, i) => {
      if (i > 0) ruleAt(doc, doc.y)
      doc.moveDown(0.4)
      doc.font('bold').fontSize(10.5).fillColor(COLORS.ink).text(g.description)

      const metaParts = []
      if (g.responsible) metaParts.push(`Responsable : ${g.responsible}`)
      if (g.targetDate) metaParts.push(`Délai prévu : ${formatDateFr(g.targetDate)}`)
      if (metaParts.length > 0) {
        doc.moveDown(0.15)
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(metaParts.join('    ·    '))
      }
      if (g.communityResources) {
        doc.moveDown(0.1)
        doc.font('regular').fontSize(8.5).fillColor(COLORS.inkSoft).text(`Ressources communautaires : ${g.communityResources}`)
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

  sectionTitle(doc, 'Résumé')
  doc.font('regular').fontSize(10.5).fillColor(COLORS.ink).text(reportSummaryText(student), { lineGap: 3 })

  sectionTitle(doc, 'Objectifs suivis')
  student.goals.forEach((goal, i) => {
    if (i > 0) ruleAt(doc, doc.y)
    doc.moveDown(0.5)

    const status = COLORS.status[goal.status] || COLORS.status.non_atteint
    const statusLabel = GOAL_STATUS_LABELS[goal.status] || goal.status
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
      const endY = drawStrategyChips(doc, goal.strategies, doc.page.margins.left, doc.y, contentWidth)
      doc.y = endY
    }
    doc.moveDown(0.4)
  })

  if (student.notes.length > 0) {
    sectionTitle(doc, "Notes de l'enseignant")
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
  const alertText = `Prochaine révision du PEI ${reviewDaysLabel(student.reviewInDays)} — à inscrire à l'ordre du jour de la rencontre parents-école.`
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
