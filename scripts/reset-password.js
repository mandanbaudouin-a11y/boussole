#!/usr/bin/env node
// Réinitialisation de mot de passe en ligne de commande — pas d'internet, pas
// de courriel : l'app tourne hors ligne et n'a aucun mécanisme d'envoi. La
// protection ici, c'est l'accès physique/terminal au poste, comme pour
// n'importe quel outil d'administration local.
//
// Usage :
//   node scripts/reset-password.js --user <nom_utilisateur> --password <nouveau_mot_de_passe>
//
// Pour l'app de bureau installée (pas le mode développement), pointer
// PEI_CENTRAL_DATA_DIR vers le dossier de données réel avant d'exécuter :
//   macOS   : PEI_CENTRAL_DATA_DIR=~/Library/Application\ Support/boussole/data node scripts/reset-password.js ...
//   Windows : set PEI_CENTRAL_DATA_DIR=%APPDATA%\boussole\data && node scripts\reset-password.js ...

import { parseArgs } from 'node:util'
import bcrypt from 'bcrypt'
import { db, dataDir } from '../server/db.js'

const SALT_ROUNDS = 12 // doit rester identique à server/auth.js (createAccount)
const MIN_PASSWORD_LENGTH = 8

function fail(message) {
  console.error(message)
  process.exit(1)
}

let args
try {
  ;({ values: args } = parseArgs({
    options: {
      user: { type: 'string' },
      password: { type: 'string' },
    },
  }))
} catch (err) {
  fail(`Arguments invalides : ${err.message}\nUsage : node scripts/reset-password.js --user <nom_utilisateur> --password <nouveau_mot_de_passe>`)
}

if (!args.user || !args.password) {
  fail('Usage : node scripts/reset-password.js --user <nom_utilisateur> --password <nouveau_mot_de_passe>')
}

if (args.password.length < MIN_PASSWORD_LENGTH) {
  fail(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
}

const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(args.user)
if (!user) {
  fail(`Aucun compte trouvé pour ce nom d'utilisateur : ${args.user}\n(Base de données utilisée : ${dataDir})`)
}

const hash = bcrypt.hashSync(args.password, SALT_ROUNDS)
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)

// Jamais le mot de passe en clair dans la sortie, même en cas d'erreur
// ci-dessus : args.password n'apparaît dans aucun message.
console.log(`Mot de passe réinitialisé pour ${user.username}.`)
