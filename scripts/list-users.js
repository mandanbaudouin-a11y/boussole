#!/usr/bin/env node
// Liste les noms d'utilisateur existants (jamais les mots de passe) — utile
// si l'enseignant a oublié son nom d'utilisateur en plus de son mot de passe.
//
// Usage :
//   node scripts/list-users.js
//
// Pour l'app de bureau installée, pointer PEI_CENTRAL_DATA_DIR vers le
// dossier de données réel avant d'exécuter (voir reset-password.js).

import { db, dataDir } from '../server/db.js'

const ROLE_LABELS = { enseignant: 'Enseignant', ea: 'EA' }

const users = db.prepare('SELECT username, role, nom_complet AS nomComplet FROM users ORDER BY created_at ASC').all()

if (users.length === 0) {
  console.log(`Aucun compte trouvé.\n(Base de données utilisée : ${dataDir})`)
  process.exit(0)
}

console.log(`Comptes trouvés (${dataDir}) :\n`)
for (const u of users) {
  const role = ROLE_LABELS[u.role] || u.role
  const name = u.nomComplet ? ` — ${u.nomComplet}` : ''
  console.log(`  ${u.username}${name} (${role})`)
}
