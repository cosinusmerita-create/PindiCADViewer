const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')
const { execFile } = require('node:child_process')

// app.isPackaged alone isn't enough to tell "dev server" apart from
// "preview the freshly built dist/ output": running `electron .` straight
// against the project folder is ALWAYS unpackaged, whether or not dist/
// was ever built - so electron:preview (build dist/, then plain `electron
// .`) would silently fall into the same isDev branch as electron:dev and
// load the dev server instead of the build it's meant to be previewing.
// --preview (set by the electron:preview script) disambiguates the two.
const isPreview = process.argv.includes('--preview')
const isDev = !app.isPackaged && !isPreview
// Keep in sync with src/utils/formats.ts (the renderer's list of readable formats).
const GEOMETRY_FILE_RE = /\.(step|stp|iges|igs|brep|stl|obj|3dxml|dxf|pindi)$/i
// Formats the viewer cannot parse itself but the local SOLIDWORKS can open
// (see solidworks-convert.ps1) - keep in sync with SOLIDWORKS_BRIDGE_FORMATS
// in src/utils/formats.ts. Creo/NX-style version suffixes (part.prt.3) are
// accepted. Deliberately NOT registered as file associations: double-clicking
// a .SLDPRT must keep opening SOLIDWORKS.
const SOLIDWORKS_FILE_RE =
  /\.(sldprt|sldasm|slddrw|prtdot|asmdot|drwdot|eprt|easm|edrw|x_t|x_b|xmt_txt|xmt_bin|sat|sab|jt|ipt|iam|catpart|catproduct|par|psm|dwg|cal|ct1|prt|asm|neu|xas|xpr)(\.\d+)?$/i
const isOpenable = (arg) => GEOMETRY_FILE_RE.test(arg) || SOLIDWORKS_FILE_RE.test(arg)

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
                { name: 'Fichiers CAO', extensions: ['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', '3dxml', 'dxf', 'pindi'] },
                { name: 'STEP', extensions: ['step', 'stp'] },
                { name: 'IGES', extensions: ['iges', 'igs'] },
                { name: 'STL', extensions: ['stl'] },
                { name: 'OBJ', extensions: ['obj'] },
                { name: '3DXML (CATIA V6)', extensions: ['3dxml'] },
                { name: 'DXF', extensions: ['dxf'] },
                {
                  name: 'Via SOLIDWORKS (natifs, Parasolid, ACIS, JT, Inventor, CATIA V5, NX, Creo, Solid Edge, DWG…)',
                  extensions: ['sldprt', 'sldasm', 'slddrw', 'prtdot', 'asmdot', 'drwdot', 'eprt', 'easm', 'edrw',
                    'x_t', 'x_b', 'xmt_txt', 'sat', 'sab', 'jt', 'ipt', 'iam', 'catpart', 'catproduct', 'par', 'psm',
                    'prt', 'asm', 'neu', 'xas', 'xpr', 'dwg', 'cal', 'ct1'],
                },
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

// Opens a CAD file in the local SOLIDWORKS and exports a copy the viewer can
// read (STEP for parts/assemblies, DXF for drawings) - see
// solidworks-convert.ps1 for the COM details and safety rules. Windows only.
// One conversion at a time (SOLIDWORKS is single-threaded for its API), with
// a hard timeout: an import can stall inside SOLIDWORKS (a progress window
// that never closes was observed on an Inventor assembly), and the renderer
// must get an answer rather than spin forever. The script ships unpacked
// (build.asarUnpack): PowerShell cannot read a file inside app.asar.
const CONVERT_TIMEOUT_MS = 10 * 60 * 1000
let conversionQueue = Promise.resolve()

function runSolidWorksConversion(filePath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, code: 'NOT_WINDOWS' })
      return
    }
    const script = path.join(__dirname, 'solidworks-convert.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
    fs.mkdtemp(path.join(os.tmpdir(), 'pindicad-sw-')).then((outDir) => {
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InputPath', filePath, '-OutputDir', outDir]
      execFile('powershell.exe', args, { timeout: CONVERT_TIMEOUT_MS, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, async (error, stdout) => {
        const cleanup = () => fs.rm(outDir, { recursive: true, force: true }).catch(() => {})
        if (error && error.killed) {
          await cleanup()
          resolve({ ok: false, code: 'TIMEOUT' })
          return
        }
        let result
        try {
          const lines = String(stdout).trim().split(/\r?\n/)
          result = JSON.parse(lines[lines.length - 1])
        } catch {
          await cleanup()
          resolve({ ok: false, code: 'BAD_OUTPUT', message: String(stdout).slice(-400) })
          return
        }
        if (!result.ok) {
          await cleanup()
          resolve(result)
          return
        }
        try {
          const bytes = await fs.readFile(result.output)
          resolve({ ok: true, name: path.basename(result.output), kind: result.kind, bytes, log: result.log })
        } catch (err) {
          resolve({ ok: false, code: 'READ_FAILED', message: String(err) })
        } finally {
          await cleanup()
        }
      })
    }, (err) => resolve({ ok: false, code: 'TEMP_FAILED', message: String(err) }))
  })
}

ipcMain.handle('convert-with-solidworks', (_event, filePath) => {
  const run = conversionQueue.then(() => runSolidWorksConversion(filePath))
  conversionQueue = run.catch(() => {})
  return run
})

// Ouvrir un fichier passé en argument (double-clic sur .step)
const fileArg = process.argv.find(isOpenable)

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
    const file = argv.find(isOpenable)
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
