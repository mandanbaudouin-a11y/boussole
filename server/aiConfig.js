import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import path from 'path'
import { dataDir } from './db.js'

// Clés API stockées dans des fichiers locaux au dossier de données (comme
// session-secret.txt), jamais dans la base SQLite : ça garantit qu'elles ne
// se retrouvent jamais dans une sauvegarde exportée (voir /api/backup/export).
// Une clé par fournisseur, pour permettre à l'enseignant de basculer de l'un
// à l'autre sans avoir à retaper une clé déjà enregistrée.

export const AI_PROVIDERS = ['anthropic', 'mistral']
export const AI_PROVIDER_LABELS = {
  anthropic: 'Claude (Anthropic)',
  mistral: 'Mistral',
}

const ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
}

function keyPath(provider) {
  return path.join(dataDir, `${provider}-api-key.txt`)
}

const activeProviderPath = path.join(dataDir, 'active-ai-provider.txt')

export function hasApiKey(provider) {
  return existsSync(keyPath(provider)) || !!process.env[ENV_VARS[provider]]
}

export function getApiKey(provider) {
  if (existsSync(keyPath(provider))) return readFileSync(keyPath(provider), 'utf8').trim()
  return process.env[ENV_VARS[provider]] || null
}

export function setApiKey(provider, key) {
  writeFileSync(keyPath(provider), key.trim(), 'utf8')
}

export function clearApiKey(provider) {
  if (existsSync(keyPath(provider))) unlinkSync(keyPath(provider))
}

export function getActiveProvider() {
  if (existsSync(activeProviderPath)) {
    const value = readFileSync(activeProviderPath, 'utf8').trim()
    if (AI_PROVIDERS.includes(value)) return value
  }
  return 'anthropic'
}

export function setActiveProvider(provider) {
  if (!AI_PROVIDERS.includes(provider)) throw new Error('Fournisseur invalide.')
  writeFileSync(activeProviderPath, provider, 'utf8')
}

export function hasActiveApiKey() {
  return hasApiKey(getActiveProvider())
}

export function getActiveApiKey() {
  return getApiKey(getActiveProvider())
}
