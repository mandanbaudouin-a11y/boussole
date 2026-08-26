import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export async function extractText(buffer, filename) {
  const lower = (filename || '').toLowerCase()

  if (lower.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return (result.text || '').replace(/^--\s*\d+\s*of\s*\d+\s*--\s*$/gim, '').trim()
    } finally {
      await parser.destroy()
    }
  }

  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  if (lower.endsWith('.doc')) {
    throw new Error(
      "Le format .doc (Word 97-2003) n'est pas pris en charge. Enregistrez le document en .docx ou en PDF et réessayez."
    )
  }

  throw new Error('Format de fichier non pris en charge. Utilisez un PDF ou un fichier Word (.docx).')
}

const GOAL_SECTION_HEADERS = /^(objectifs?|cibles?|buts?)\b/i
const STOP_SECTION_HEADERS = /^(notes?|r[ée]vision|signatures?|date|commentaires?)\b/i

function stripBullet(line) {
  const match = line.match(/^(?:[-•*•]|\d+[.)])\s*(.+)/)
  return match ? match[1].trim() : null
}

export function guessFields(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const nameMatch = text.match(
    /(?:nom de l['’]?[ée]l[èe]ve|[ée]l[èe]ve concern[ée]e?|nom\s+et\s+pr[ée]nom|nom)\s*[:\-]\s*([^\n\r]{2,60})/i
  )
  const gradeMatch = text.match(/(?:niveau|ann[ée]e scolaire|degr[ée]|classe)\s*[:\-]\s*([^\n\r]{2,40})/i)

  const name = nameMatch ? nameMatch[1].trim() : lines[0] || ''
  const grade = gradeMatch ? gradeMatch[1].trim() : ''

  const goals = []
  const headerIndex = lines.findIndex((l) => GOAL_SECTION_HEADERS.test(l) && l.length < 60)

  if (headerIndex !== -1) {
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i]
      if (STOP_SECTION_HEADERS.test(line)) break
      const bullet = stripBullet(line)
      if (bullet) goals.push(bullet)
    }
  }

  if (goals.length === 0) {
    for (const line of lines) {
      const bullet = stripBullet(line)
      if (bullet) goals.push(bullet)
    }
  }

  return { name, grade, goals: goals.slice(0, 20) }
}
