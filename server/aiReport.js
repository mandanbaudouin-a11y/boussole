import Anthropic from '@anthropic-ai/sdk'
import { GOAL_STATUS_LABELS, STRATEGY_CATEGORY_LABELS } from './db.js'
import { getActiveProvider, getApiKey, AI_PROVIDER_LABELS } from './aiConfig.js'
import { t } from './i18nEn.js'

const CLAUDE_MODEL = 'claude-sonnet-5'
const MISTRAL_MODEL = 'mistral-large-latest'

const SYSTEM_PROMPT = `Tu es un ou une orthopédagogue qui aide le personnel enseignant du Manitoba \
francophone à rédiger la section « Résumé » d'un rapport de progrès pour un Plan \
d'Enseignement Individualisé (PEI).

Ton attendu : professionnel, positif, orienté vers le progrès, respectueux envers \
l'élève et sa famille. Jamais alarmiste, jamais condescendant.

Structure attendue, en paragraphes fluides et bien liés (aucune liste à puces, \
aucun titre de section) :
1. Contexte bref (période couverte, portrait général)
2. Progrès réalisé pour chaque objectif actif
3. Défis rencontrés, nommés avec tact
4. Stratégies employées et leur effet observé
5. Recommandations pour la prochaine période

Contraintes strictes :
- Français correct et complet, avec tous les accents (é, è, à, ç, ê, î, ô, û, œ)
- Terminologie éducative appropriée au contexte manitobain francophone
- Ne t'appuie que sur les données fournies ; n'invente aucun fait, aucune date, \
aucun détail qui n'y figure pas
- Vise environ 200 à 350 mots
- Réponds uniquement avec le texte narratif final, prêt à être relu et modifié \
par l'enseignant·e — sans préambule, sans titre, sans notes entre crochets`

const SYSTEM_PROMPT_EN = `You are a resource teacher helping school staff write the "Summary" section \
of a progress report for an Individual Education Plan (IEP).

Expected tone: professional, positive, progress-oriented, respectful of the student and their \
family. Never alarmist, never condescending.

Expected structure, in flowing, well-connected paragraphs (no bullet lists, no section headings):
1. Brief context (period covered, general overview)
2. Progress made on each active goal
3. Challenges encountered, named tactfully
4. Strategies used and their observed effect
5. Recommendations for the next period

Strict constraints:
- Correct, complete English
- Educational terminology appropriate to the context
- Rely only on the data provided; do not invent any fact, date, or detail not present in it
- Aim for roughly 200 to 350 words
- Reply only with the final narrative text, ready to be reviewed and edited by the teacher — no \
preamble, no title, no bracketed notes`

function buildUserPrompt(student, lang = 'fr') {
  const status = (s) => t(GOAL_STATUS_LABELS[s] || s, lang)
  const category = (c) => t(STRATEGY_CATEGORY_LABELS[c] || c, lang)

  if (lang === 'en') {
    const lines = []
    lines.push(`Student: ${student.name} — ${student.grade}`)
    if (student.forces) lines.push(`Strengths: ${student.forces}`)
    if (student.besoins) lines.push(`Needs: ${student.besoins}`)
    lines.push(
      student.reviewInDays < 0
        ? `IEP review overdue by ${Math.abs(student.reviewInDays)} day${Math.abs(student.reviewInDays) > 1 ? 's' : ''}.`
        : `IEP review scheduled in ${student.reviewInDays} day${student.reviewInDays > 1 ? 's' : ''}.`
    )
    lines.push('')
    lines.push('IEP goals:')
    student.goals.forEach((g, i) => {
      lines.push(`${i + 1}. ${g.label} — current status: ${status(g.status)}`)
      if (g.strategies && g.strategies.length > 0) {
        const strategyList = g.strategies.map((s) => (s.category ? `${s.label} (${category(s.category)})` : s.label)).join('; ')
        lines.push(`   Strategies used: ${strategyList}`)
      }
      if (g.statusHistory && g.statusHistory.length > 1) {
        const progression = [...g.statusHistory].reverse().map((h) => status(h.status)).join(' -> ')
        lines.push(`   Status progression: ${progression}`)
      }
    })

    if (student.weeklyRate && student.weeklyRate.length > 0) {
      lines.push('')
      lines.push('Weekly success rate (all strategies combined):')
      student.weeklyRate.forEach((w) => lines.push(`- ${w.week}: ${w.pct}%`))
    }

    if (student.notes && student.notes.length > 0) {
      lines.push('')
      lines.push('Teacher / EA tracking notes (most recent first):')
      student.notes.forEach((n) => lines.push(`- ${n.date}: ${n.text}`))
    }

    return lines.join('\n')
  }

  const lines = []
  lines.push(`Élève : ${student.name} — ${student.grade}`)
  if (student.forces) lines.push(`Forces : ${student.forces}`)
  if (student.besoins) lines.push(`Besoins : ${student.besoins}`)
  lines.push(
    student.reviewInDays < 0
      ? `Révision du PEI en retard de ${Math.abs(student.reviewInDays)} jour${Math.abs(student.reviewInDays) > 1 ? 's' : ''}.`
      : `Révision du PEI prévue dans ${student.reviewInDays} jour${student.reviewInDays > 1 ? 's' : ''}.`
  )
  lines.push('')
  lines.push('Objectifs du PEI :')
  student.goals.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.label} — niveau de satisfaction actuel : ${GOAL_STATUS_LABELS[g.status] || g.status}`)
    if (g.strategies && g.strategies.length > 0) {
      const strategyList = g.strategies
        .map((s) => (s.category ? `${s.label} (${STRATEGY_CATEGORY_LABELS[s.category]})` : s.label))
        .join('; ')
      lines.push(`   Stratégies utilisées : ${strategyList}`)
    }
    if (g.statusHistory && g.statusHistory.length > 1) {
      const progression = [...g.statusHistory]
        .reverse()
        .map((h) => GOAL_STATUS_LABELS[h.status] || h.status)
        .join(' -> ')
      lines.push(`   Évolution du niveau : ${progression}`)
    }
  })

  if (student.weeklyRate && student.weeklyRate.length > 0) {
    lines.push('')
    lines.push('Taux de réussite hebdomadaire (toutes stratégies confondues) :')
    student.weeklyRate.forEach((w) => lines.push(`- ${w.week} : ${w.pct}%`))
  }

  if (student.notes && student.notes.length > 0) {
    lines.push('')
    lines.push("Notes de suivi de l'enseignant·e ou de l'aide-enseignant·e (les plus récentes en premier) :")
    student.notes.forEach((n) => lines.push(`- ${n.date} : ${n.text}`))
  }

  return lines.join('\n')
}

function noApiKeyError(provider) {
  const err = new Error(
    `Aucune clé API ${AI_PROVIDER_LABELS[provider]} n'est configurée. Ajoutez-la dans Comptes > Paramètres IA.`
  )
  err.code = 'NO_API_KEY'
  return err
}

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw noApiKeyError('anthropic')

  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.5,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (e) {
    if (e.status === 401) {
      throw new Error("La clé API Claude est invalide. Vérifiez-la dans Comptes > Paramètres IA.")
    }
    if (e.status === 429) {
      throw new Error("Trop de requêtes envoyées à l'API Claude. Réessayez dans quelques instants.")
    }
    if (e.status >= 500 || !e.status) {
      throw new Error('Le service Claude est temporairement indisponible. Réessayez plus tard.')
    }
    throw new Error('La génération a échoué : ' + (e.message || 'erreur inconnue'))
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  if (!text) {
    throw new Error("La génération n'a produit aucun texte. Réessayez.")
  }

  return text
}

// API Mistral compatible avec le format "chat completions" : un simple fetch
// suffit, pas besoin d'ajouter leur SDK comme dépendance supplémentaire.
async function callMistral(systemPrompt, userPrompt, maxTokens) {
  const apiKey = getApiKey('mistral')
  if (!apiKey) throw noApiKeyError('mistral')

  let response
  try {
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        max_tokens: maxTokens,
        temperature: 0.5,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch {
    throw new Error('Le service Mistral est temporairement indisponible. Réessayez plus tard.')
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("La clé API Mistral est invalide. Vérifiez-la dans Comptes > Paramètres IA.")
    }
    if (response.status === 429) {
      throw new Error("Trop de requêtes envoyées à l'API Mistral. Réessayez dans quelques instants.")
    }
    if (response.status >= 500) {
      throw new Error('Le service Mistral est temporairement indisponible. Réessayez plus tard.')
    }
    const body = await response.json().catch(() => ({}))
    throw new Error('La génération a échoué : ' + (body.message || `erreur ${response.status}`))
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content?.trim()

  if (!text) {
    throw new Error("La génération n'a produit aucun texte. Réessayez.")
  }

  return text
}

async function callAI(systemPrompt, userPrompt, maxTokens) {
  const provider = getActiveProvider()
  if (provider === 'mistral') return callMistral(systemPrompt, userPrompt, maxTokens)
  return callClaude(systemPrompt, userPrompt, maxTokens)
}

export async function generateNarrativeReport(student, lang = 'fr') {
  return callAI(lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT, buildUserPrompt(student, lang), 1000)
}

const FIELD_LABELS = { forces: 'forces', besoins: 'besoins' }
const FIELD_LABELS_EN = { forces: 'strengths', besoins: 'needs' }

const SUGGEST_SYSTEM_PROMPT = `Tu aides le personnel enseignant du Manitoba francophone à formuler la \
section « forces » ou « besoins » du profil d'un élève dans un Plan d'Enseignement Individualisé (PEI).

Tâche : reformuler et améliorer le texte fourni par l'enseignant·e — le rendre plus clair, plus \
professionnel et mieux structuré — sans changer son sens, sans inventer de nouveaux faits ou \
détails qui n'y figurent pas, et sans l'allonger inutilement.

Contraintes :
- Français correct et complet, avec tous les accents
- Ton professionnel, factuel, respectueux envers l'élève
- Si le texte fourni est déjà vide ou très bref (quelques mots-clés), développe-le en phrases \
complètes à partir de ces seuls mots-clés, sans ajouter d'information non fournie
- Réponds uniquement avec le texte reformulé, sans préambule ni notes entre crochets`

const SUGGEST_SYSTEM_PROMPT_EN = `You help school staff word the "strengths" or "needs" section of a \
student's profile in an Individual Education Plan (IEP).

Task: rephrase and improve the text provided by the teacher — make it clearer, more professional and \
better structured — without changing its meaning, without inventing new facts or details not present \
in it, and without needlessly lengthening it.

Constraints:
- Correct, complete English
- Professional, factual tone, respectful of the student
- If the provided text is empty or very brief (a few keywords), expand it into complete sentences \
based only on those keywords, without adding unprovided information
- Reply only with the rephrased text, no preamble, no bracketed notes`

export async function suggestFieldText(student, field, draft, lang = 'fr') {
  if (!FIELD_LABELS[field]) throw new Error('Champ invalide.')

  if (lang === 'en') {
    const lines = [`Student: ${student.name} — ${student.grade}`]
    lines.push(`Field to rephrase: ${FIELD_LABELS_EN[field]}`)
    lines.push('')
    lines.push(draft && draft.trim() ? `Teacher's current text:\n${draft.trim()}` : 'Current text: (empty)')
    return callAI(SUGGEST_SYSTEM_PROMPT_EN, lines.join('\n'), 500)
  }

  const lines = [`Élève : ${student.name} — ${student.grade}`]
  lines.push(`Champ à reformuler : ${FIELD_LABELS[field]}`)
  lines.push('')
  lines.push(draft && draft.trim() ? `Texte actuel de l'enseignant·e :\n${draft.trim()}` : "Texte actuel : (vide)")

  return callAI(SUGGEST_SYSTEM_PROMPT, lines.join('\n'), 500)
}
