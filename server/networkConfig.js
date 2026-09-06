import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import os from 'os'
import { dataDir } from './db.js'

// Partage sur le réseau local : désactivé par défaut (comme la restriction à
// 127.0.0.1 mise en place pour la conformité LAIPVP). Stocké dans un fichier
// local plutôt que dans la base SQLite, comme les clés API (voir
// server/aiConfig.js) : un réglage propre à cet ordinateur, jamais inclus
// dans une sauvegarde exportée ni transporté vers un autre poste.
const lanSharingPath = path.join(dataDir, 'lan-sharing-enabled.txt')

export function isLanSharingEnabled() {
  return existsSync(lanSharingPath) && readFileSync(lanSharingPath, 'utf8').trim() === '1'
}

export function setLanSharingEnabled(enabled) {
  writeFileSync(lanSharingPath, enabled ? '1' : '0', 'utf8')
}

// Adresses IPv4 non internes (donc joignables depuis un autre appareil du
// même réseau) — affichées à l'enseignant pour qu'il sache quelle adresse
// communiquer à un collègue, plutôt que de lui faire deviner ou chercher
// dans les réglages système.
export function getLanAddresses() {
  const interfaces = os.networkInterfaces()
  const addresses = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  return addresses
}
