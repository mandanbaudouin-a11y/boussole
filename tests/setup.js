import fs from 'fs'
import path from 'path'
import os from 'os'

// Chaque fichier de test obtient sa propre base SQLite isolee (jamais la
// vraie base du projet ni celle d'une app installee) : defini avant que le
// fichier de test importe server/db.js, qui lit cette variable a l'import.
process.env.PEI_CENTRAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'repere-test-'))
