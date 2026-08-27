import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3001
// Ordre du plus recent au plus ancien nom npm utilise par l'app (determine le
// dossier de donnees userData d'Electron a chaque rebranding).
const LEGACY_APP_NAMES = ['boussole', 'pei-central']
const RELEASES_URL = 'https://github.com/mandanbaudouin-a11y/boussole/releases/latest'

console.log('[main] script loaded, pid', process.pid)

let mainWindow

// L'app s'est appelee "pei-central" puis "Boussole" avant le rebranding
// "Repère" (le nom npm determine le dossier de donnees userData d'Electron).
// Migration a usage unique : si le nouveau dossier de donnees n'existe pas
// encore, on cherche le premier nom precedent dont le dossier existe et on
// copie son contenu avant le tout premier demarrage sous le nouveau nom,
// pour ne pas perdre l'acces aux donnees deja saisies.
function migrateLegacyDataDir(newDataDir) {
  if (fs.existsSync(newDataDir)) return
  for (const legacyName of LEGACY_APP_NAMES) {
    const legacyDataDir = path.join(path.dirname(app.getPath('userData')), legacyName, 'data')
    if (!fs.existsSync(legacyDataDir)) continue
    console.log('[main] migration des donnees depuis', legacyDataDir, 'vers', newDataDir)
    fs.mkdirSync(path.dirname(newDataDir), { recursive: true })
    fs.cpSync(legacyDataDir, newDataDir, { recursive: true })
    return
  }
}

// Mise a jour automatique via GitHub Releases (voir build.publish dans
// package.json). Windows : telechargement et installation automatiques.
// macOS : l'app n'est pas signee (pas de certificat Apple Developer ID) et
// Squirrel.Mac refuse d'installer une mise a jour non signee — on verifie
// donc la disponibilite d'une nouvelle version mais on renvoie l'utilisateur
// vers la page de telechargement manuel plutot que de tenter une install
// silencieuse qui echouerait.
function setupAutoUpdate() {
  // require() differe (pas d'import ESM statique en tete de fichier, et pas
  // d'import() dynamique non plus) : un import statique bloque
  // indefiniment le chargeur ESM de Node une fois le module lu depuis
  // l'archive asar (reproduit et confirme en test), et l'interop ESM/CJS de
  // import() dynamique ne remonte pas correctement les exports nommes
  // depuis l'asar (autoUpdater revenait undefined). Un require() CJS classique
  // n'a aucun de ces deux problemes.
  const { autoUpdater } = require('electron-updater')

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    console.log('[update] nouvelle version disponible', info.version)
    if (process.platform === 'win32') {
      autoUpdater.downloadUpdate().catch((err) => console.error('[update] echec du telechargement', err))
    } else {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Mise a jour disponible',
          message: `Repère ${info.version} est disponible (version actuelle : ${app.getVersion()}).`,
          detail:
            "La mise à jour automatique n'est pas encore activée sur Mac. Téléchargez et installez la nouvelle version manuellement.",
          buttons: ['Ouvrir la page de téléchargement', 'Plus tard'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          console.log('[update] dialogue ferme, reponse', response)
          if (response === 0) shell.openExternal(RELEASES_URL)
        })
        .catch((err) => console.error('[update] echec de l\'affichage du dialogue', err))
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[update] telechargee, prete a installer', info.version)
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Mise a jour prete',
        message: `Repère ${info.version} est prête à être installée.`,
        detail: "L'application va redémarrer pour terminer l'installation.",
        buttons: ['Redémarrer maintenant', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (err) => {
    // Une verification qui echoue (pas de connexion, etc.) ne doit jamais
    // interrompre l'usage normal de l'app — on se contente de logger.
    console.error('[update] erreur de verification', err)
  })

  const check = () => autoUpdater.checkForUpdates().catch((err) => console.error('[update] echec de la verification', err))
  // On attend que la fenetre ait fini son premier rendu avant la toute
  // premiere verification : un dialogue natif declenche trop tot (fenetre
  // pas encore affichee) peut ne jamais apparaitre a l'ecran.
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    check()
  } else if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', check)
  }
  setInterval(check, 4 * 60 * 60 * 1000)
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
          'Repère — erreur de démarrage',
          `Le serveur local n'a pas pu demarrer sur le port ${PORT}.\n\n${err.stack || err.message}`
        )
        app.quit()
        return
      }

      console.log('[main] creating window...')
      createWindow()

      if (app.isPackaged) setupAutoUpdate()

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
    title: 'Repère',
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
