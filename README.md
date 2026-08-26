# Boussole — prototype

Prototype MVP pour la gestion des PEI (plans d'enseignement individualises), appuye sur une base de donnees SQLite locale (`data/pei-central.db`).

## Ecrans inclus
- **Tableau de bord** — liste des eleves et coche quotidienne des objectifs (EA et enseignant) ; ajout/suppression d'eleves, ajout/modification/suppression d'objectifs, import de PEI (PDF/Word) et sauvegarde/restauration des donnees reserves a l'enseignant
- **Fiche eleve** — objectifs, progres sur 4 semaines, notes recentes (ajout de note ouvert a l'EA ; modification des infos de l'eleve et des objectifs reservee a l'enseignant)
- **Rapport** — resume genere automatiquement a partir des donnees de suivi, pret pour une rencontre parents-ecole
- **Comptes** (enseignant uniquement) — liste des comptes et creation de comptes EA

## Import de PEI (PDF / Word)
Le bouton **Importer un PEI** du tableau de bord accepte un fichier PDF ou Word (`.docx`). Le texte est
extrait cote serveur (`pdf-parse` / `mammoth`), puis une analyse par mots-cles propose un nom d'eleve, un
niveau et une liste d'objectifs. Ces champs sont pre-remplis dans un formulaire editable — **rien n'est
ecrit dans la base tant que l'enseignant n'a pas verifie et clique sur "Confirmer et ajouter l'eleve"**. Le
texte brut extrait reste consultable dans la fenetre pour corriger ce que l'analyse aurait mal repere.
Le format `.doc` (Word 97-2003) n'est pas pris en charge ; seuls `.pdf` et `.docx` le sont.

## Sauvegarde et restauration (enseignant uniquement)
Sur le tableau de bord, le bloc **Sauvegarde des donnees** (bordure en pointilles) rappelle que tout est
stocke uniquement sur cet ordinateur, et propose deux actions :
- **Exporter une sauvegarde** — telecharge un fichier `.json` horodate contenant tous les eleves, objectifs,
  taux hebdomadaires et notes actuels.
- **Restaurer une sauvegarde** — selectionne un fichier `.json` exporte precedemment et **remplace
  definitivement** toutes les donnees actuelles des eleves par son contenu. Une case a cocher explicite
  ("je comprends que...") doit etre validee avant que le bouton de restauration ne devienne actif ; le
  fichier est aussi valide cote serveur avant toute suppression (rien n'est efface si le fichier est
  invalide).

La sauvegarde/restauration ne touche jamais la table des comptes (enseignant, EA) : ni les noms
d'utilisateur, ni les mots de passe ne sont exportes ou modifies par cette fonctionnalite, pour eviter
qu'un fichier telecharge contienne des hachages et pour ne jamais risquer de verrouiller l'enseignant hors
de son propre compte.

## Authentification et roles
Deux roles : **enseignant** (tous les droits) et **EA** (educateur/educatrice specialise-e). Au tout
premier lancement (aucun compte enseignant en base), l'application affiche un ecran de **creation de
compte enseignant** (nom d'utilisateur + mot de passe, 8 caracteres minimum). C'est ensuite l'enseignant
qui cree le ou les comptes EA depuis l'onglet **Comptes** (visible seulement pour son role). L'ecran de
**connexion** propose un selecteur "Enseignant / EA" ; il doit correspondre au role reel du compte, sinon
la connexion est refusee avec un message explicite.

Droits de l'EA : voir tous les eleves, cocher/decocher les objectifs existants, ajouter des notes de
suivi. L'EA ne peut pas ajouter/supprimer des eleves, ni ajouter/modifier/supprimer le texte des objectifs,
ni importer un PEI, ni creer d'autres comptes — ces actions sont reservees a l'enseignant et refusees par
l'API (403) meme si elles etaient tentees hors de l'interface.

Le mot de passe est hache avec `bcrypt` (12 rounds) avant d'etre stocke — jamais en clair. La session
repose sur un cookie httpOnly (non lisible en JavaScript) et se **prolonge a chaque requete** ; sans
activite pendant **30 minutes**, l'utilisateur est deconnecte automatiquement, a la fois cote serveur
(expiration du cookie) et cote client (detection d'inactivite sur la souris/clavier). Toutes les routes
`/api/*` (sauf `/api/auth/*`) exigent une session valide. Un blocage temporaire s'applique apres 5
tentatives de connexion echouees pour un meme nom d'utilisateur.

Le secret de session est genere une fois et conserve dans `data/session-secret.txt` (non versionne). Le
cookie n'est pas marque `secure` par defaut car le prototype tourne en HTTP local ; a passer a `true` dans
`server/index.js` si l'application est un jour servie en HTTPS.

## Architecture
- `server/` — API Express (port 3001) + base SQLite via `better-sqlite3`, fichier stocke dans `data/pei-central.db` ; extraction de fichiers via `server/textExtract.js` (`pdf-parse`, `mammoth`) et upload via `multer` ; authentification via `server/auth.js` (`bcrypt`, `express-session`). `server/index.js` sert aussi le build Vite (`dist/`) sur le meme port, et expose `start(port)` pour qu'Electron puisse demarrer le serveur lui-meme
- `src/` — frontend React/Vite, communique avec l'API via `src/api.js` et `src/auth.js` (proxy Vite `/api` -> `http://localhost:3001`)
- `electron/main.js` — point d'entree de l'app de bureau : demarre le serveur Express en interne puis ouvre une fenetre pointant vers `http://localhost:3001`

## Demarrer en local (mode developpement web)

```bash
npm install
npm run dev
```

Cette commande lance en parallele l'API (port 3001) et le serveur Vite (generalement http://localhost:5173).
La base SQLite est creee et peuplee automatiquement au premier lancement si elle n'existe pas encore, dans
`data/`.

## Application de bureau (Electron)

L'app se lance en double-cliquant une icone, sans terminal : le serveur Express et la base SQLite demarrent
automatiquement a l'interieur du processus Electron (`electron/main.js`), qui ouvre ensuite une fenetre sur
`http://localhost:3001` (le meme serveur sert l'API et le frontend buildé).

**Emplacement des donnees dans l'app packagee** (different du dossier `data/` du projet, qui ne sert qu'en
mode developpement) :
- macOS : `~/Library/Application Support/boussole/data/`
- Windows : `%APPDATA%\boussole\data\`

L'app s'appelait auparavant "PEI Central" (dossier `pei-central`). Au premier lancement sous le nouveau
nom, `electron/main.js` migre automatiquement les donnees de l'ancien dossier vers le nouveau si ce
dernier n'existe pas encore — voir `migrateLegacyDataDir()`.

### Generer les installateurs

`build.npmRebuild` est desactive (`false`) dans `package.json` : le rebuild automatique des modules
natifs par `electron-builder` s'est revele peu fiable pour `better-sqlite3` en pratique (voir
l'avertissement ci-dessous) — il faut donc preparer `node_modules/better-sqlite3` manuellement pour
chaque plateforme **avant** de lancer `dist:*`.

**macOS** (compilation locale, fonctionne sur une machine Intel ou Apple Silicon) :
```bash
npx electron-rebuild --force --build-from-source --version 41.7.1
npm run dist:mac
```

**Windows** (depuis macOS, pas de compilation possible : on telecharge le binaire precompile publie par
better-sqlite3) :
```bash
cd node_modules/better-sqlite3
../.bin/prebuild-install --runtime electron --target 41.7.1 --platform win32 --arch x64 --force
cd ../..
npm run dist:win
```

`bcrypt` n'a besoin d'aucune de ces etapes : il embarque deja les binaires precompiles pour toutes les
plateformes (`node_modules/bcrypt/prebuilds/`) et selectionne le bon au demarrage.

**Consequence importante** : apres avoir prepare `better-sqlite3` pour Electron/Windows (etapes ci-dessus),
`npm run dev` / `npm run server` ne fonctionneront plus tant que ce module n'a pas ete recompile pour le
Node.js du systeme :

```bash
npm rebuild better-sqlite3 bcrypt
```

> **Avertissement (piege deja rencontre)** : `better-sqlite3` ne contient qu'un seul binaire natif a la
> fois dans `node_modules/better-sqlite3/build/Release/`. Sans les etapes manuelles ci-dessus,
> `electron-builder --win` lance depuis macOS peut **copier silencieusement le binaire macOS** dans le
> paquet Windows (aucune erreur au moment du build — l'app plante seulement au lancement sur une vraie
> machine Windows). Toujours verifier apres un build :
> ```bash
> file release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
> # doit afficher "PE32+ executable ... for MS Windows", jamais "Mach-O"
> ```

Les fichiers generes atterrissent dans `release/` (ignore par git) :

| Fichier | Plateforme | Description |
|---|---|---|
| `release/Boussole-0.1.0.dmg` | macOS | Installateur — glisser l'app dans "Applications" |
| `release/Boussole-0.1.0-mac.zip` | macOS | Meme app, en zip (alternative au dmg) |
| `release/mac/Boussole.app` | macOS | L'app non compressee, pour test rapide |
| `release/Boussole Setup 0.1.0.exe` | Windows | Installateur — double-clic, choix du dossier d'installation |
| `release/win-unpacked/Boussole.exe` | Windows | L'app non compressee, pour test rapide |

Les fichiers `.blockmap` a cote des installateurs servent aux mises a jour differentielles automatiques
(non utilisees ici) — ils peuvent etre ignores ou supprimes sans consequence.

### A savoir avant de distribuer ces fichiers
- **Aucune signature de code** : ni certificat Apple Developer ID, ni certificat Windows Authenticode ne
  sont configures. macOS affichera "developpeur non identifie" au premier lancement (clic droit -> Ouvrir,
  ou Reglages Systeme -> Confidentialite et securite -> "Ouvrir quand meme") ; Windows SmartScreen affichera
  un avertissement similaire ("Informations complementaires" -> "Executer quand meme"). C'est attendu pour
  une app non signee et n'affecte pas son fonctionnement.
- **Icone personnalisee** : configuree via `"icon": "public/android-chrome-512x512.png"` dans les sections
  `mac`/`win` du champ `build` de `package.json` ; electron-builder genere le `.icns`/`.ico` a partir de ce
  PNG source (512x512) automatiquement pendant `dist:mac`/`dist:win`.
- **macOS Intel (x64) uniquement** : le build a ete produit sur une machine Intel ; il fonctionnera aussi
  sur Apple Silicon via Rosetta 2, mais sans etre optimise nativement. Pour un build Apple Silicon natif,
  relancer `npm run dist:mac` sur une machine M1/M2/M3 (ou ajouter `arch: ["x64","arm64"]` dans la config
  `mac` du `package.json` et rebuilder).
- **Une seule instance a la fois** : lancer l'app une deuxieme fois ramene simplement la fenetre existante
  au premier plan, plutot que d'ouvrir un second serveur sur le meme port/la meme base.

## Prochaines etapes suggerees (a faire dans Claude Code)
1. Migrer vers une base de donnees hebergee au Canada pour un usage en production
2. Ajouter d'autres roles (orthopedagogue, direction, parent) au-dela d'enseignant et EA
3. Ajouter l'OCR pour les PEI scannes (documents sans couche de texte)
4. Ajouter les alertes d'echeance automatisees (notifications, pas seulement affichage)
5. Journalisation des acces pour conformite LAIPVP (Manitoba)
6. Signer les builds mac/Windows (certificats Apple Developer ID + Authenticode) pour supprimer les
   avertissements Gatekeeper/SmartScreen

## Notes de conformite
Ce prototype stocke les donnees localement sur ce poste et ne doit pas etre utilise avec de vraies informations d'eleves tant que l'hebergement au Canada et les mesures de conformite LAIPVP ne sont pas en place.
