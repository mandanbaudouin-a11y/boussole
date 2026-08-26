import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3001
const LEGACY_APP_NAME = 'pei-central'

console.log('[main] script loaded, pid', process.pid)

let mainWindow

// L'app s'appelait "pei-central" avant le rebranding "Boussole" (le nom npm
// determine le dossier de donnees userData d'Electron). Migration a usage
// unique : si le nouveau dossier de donnees n'existe pas encore mais
// l'ancien si, on copie son contenu avant le tout premier demarrage sous le
// nouveau nom, pour ne pas perdre l'acces aux donnees deja saisies.
function migrateLegacyDataDir(newDataDir) {
  if (fs.existsSync(newDataDir)) return
  const legacyDataDir = path.join(path.dirname(app.getPath('userData')), LEGACY_APP_NAME, 'data')
  if (!fs.existsSync(legacyDataDir)) return
  console.log('[main] migration des donnees depuis', legacyDataDir, 'vers', newDataDir)
  fs.mkdirSync(path.dirname(newDataDir), { recursive: true })
  fs.cpSync(legacyDataDir, newDataDir, { recursive: true })
}

// Une seule instance de l'app a la fois : evite deux serveurs Express sur le
// meme port et deux connexions concurrentes vers le meme fichier SQLite.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app
    .whenReady()
    .then(async () => {
      console.log('[main] app ready')
      // Contenu de l'app packagee = lecture seule -> les donnees vivent dans le
      // dossier utilisateur standard du systeme d'exploitation. Doit etre pose
      // AVANT le premier import de server/index.js (qui importe db.js).
      const newDataDir = path.join(app.getPath('userData'), 'data')
      migrateLegacyDataDir(newDataDir)
      process.env.PEI_CENTRAL_DATA_DIR = newDataDir
      process.env.PORT = String(PORT)
      console.log('[main] data dir', process.env.PEI_CENTRAL_DATA_DIR)

      try {
        console.log('[main] importing server...')
        const { start } = await import('../server/index.js')
        console.log('[main] starting server...')
        await start(PORT)
        console.log('[main] server started')
      } catch (err) {
        console.error('[main] server failed to start', err)
        dialog.showErrorBox(
          'Boussole — erreur de demarrage',
          `Le serveur local n'a pas pu demarrer sur le port ${PORT}.\n\n${err.stack || err.message}`
        )
        app.quit()
        return
      }

      console.log('[main] creating window...')
      createWindow()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
    .catch((err) => {
      console.error('[main] fatal startup error', err)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Boussole',
    backgroundColor: '#EEF1EC',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadURL(`http://localhost:${PORT}`)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}
