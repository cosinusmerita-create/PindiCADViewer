const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

// app.isPackaged alone isn't enough to tell "dev server" apart from
// "preview the freshly built dist/ output": running `electron .` straight
// against the project folder is ALWAYS unpackaged, whether or not dist/
// was ever built - so electron:preview (build dist/, then plain `electron
// .`) would silently fall into the same isDev branch as electron:dev and
// load the dev server instead of the build it's meant to be previewing.
// --preview (set by the electron:preview script) disambiguates the two.
const isPreview = process.argv.includes('--preview')
const isDev = !app.isPackaged && !isPreview
const GEOMETRY_FILE_RE = /\.(step|stp|stl|obj|pindi)$/i

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'PindiCADViewer',
    // logo-512.png (not the raw public/logo.png banner, which also carries
    // the "PindiCADViewer" wordmark) - a square icon-only crop, generated
    // the same way as the PWA icons.
    icon: path.join(__dirname, '../public/logo-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#1a1a2e',
    // No OS title bar / menu bar: the app draws its own top bar (logo +
    // Fichier / Affichage / Aide, see MenuBar.tsx) and Electron only overlays
    // the window buttons on its right end.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1a1a2e', symbolColor: '#e2e8f0', height: 48 },
    show: false,
  })
  // The native menu is still installed below for its keyboard accelerators
  // (Ctrl+O, F11, F12, zoom...), just never drawn.
  mainWindow.setMenuBarVisibility(false)

  // Links opened from the app (the "Site web" menu entry) go to the user's
  // browser, not to a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Surfaces a blank/broken load (e.g. a bad relative asset path in the
  // packaged build) in the app's own logs instead of just a silent blank
  // window - there's no devtools console open by default outside isDev to
  // otherwise see it in.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[PindiCADViewer] did-fail-load', errorCode, errorDescription, validatedURL)
  })
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level >= 2) console.error('[PindiCADViewer renderer]', event.message, `(${event.sourceId}:${event.lineNumber})`)
  })

  // Charger l'app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Afficher quand prêt (évite le flash blanc)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Menu personnalisé
  const menuTemplate = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir un fichier...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              filters: [
                { name: 'Fichiers CAO', extensions: ['step', 'stp', 'stl', 'obj', 'pindi'] },
                { name: 'STEP', extensions: ['step', 'stp'] },
                { name: 'STL', extensions: ['stl'] },
                { name: 'OBJ', extensions: ['obj'] },
                { name: 'Projet Pindi', extensions: ['pindi'] },
                { name: 'Tous les fichiers', extensions: ['*'] },
              ],
              properties: ['openFile'],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-file', result.filePaths[0])
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        // F11 (fullscreen of the 3D view only) is handled by the renderer, see
        // App.tsx - a native accelerator here would fullscreen the whole window.
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Zoom 100%', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'DevTools', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos de PindiCADViewer',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'PindiCADViewer',
              message: 'PindiCADViewer v1.0',
              detail:
                'Puissance Mécanique et Précision 3D\n\nProjet Ferme Écologique Pindi\nContact: fermeecopindi@gmail.com\n\n© 2026 Patrick Pindi',
            })
          },
        },
        {
          label: 'Site web',
          click: () => {
            shell.openExternal('https://cosinusmerita-create.github.io/PindiCADViewer/')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Recolors the window buttons overlaid on the custom title bar when the
// theme changes (see MenuBar.tsx).
ipcMain.on('set-titlebar-overlay', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && options && typeof options.color === 'string' && typeof options.symbolColor === 'string') {
    win.setTitleBarOverlay({ color: options.color, symbolColor: options.symbolColor, height: 48 })
  }
})

// Reads a file from disk for the renderer (see preload.js's readFile) -
// done here rather than via fetch('file://...') in the renderer itself,
// which would need webSecurity disabled to reliably avoid CORS rejections
// on a file:// origin. Node's fs already has unrestricted local file
// access from the main process, so no such tradeoff is needed here.
ipcMain.handle('read-file', async (_event, filePath) => {
  const buffer = await fs.readFile(filePath)
  return buffer
})

// Ouvrir un fichier passé en argument (double-clic sur .step)
const fileArg = process.argv.find((arg) => GEOMETRY_FILE_RE.test(arg))

// Single-instance: double-clicking a second .step while the app is already
// open hands the file to the running window (via 'second-instance') instead
// of spawning a second app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const file = argv.find((arg) => GEOMETRY_FILE_RE.test(arg))
    if (file) mainWindow.webContents.send('open-file', file)
  })

  app.whenReady().then(() => {
    createWindow()

    if (fileArg) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('open-file', fileArg)
      })
    }
  })
}

app.on('window-all-closed', () => {
  // macOS convention: the app stays running (in the dock) with no windows
  // open until the user explicitly quits - 'activate' below reopens one.
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Gestion de l'ouverture de fichier sur macOS
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('open-file', filePath)
  }
})
