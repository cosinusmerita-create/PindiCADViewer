const { contextBridge, ipcRenderer, webUtils } = require('electron')

// main.js sends 'open-file' (file passed on the command line / double-click)
// on did-finish-load, which can come before React has mounted and called
// onOpenFile - the path was then lost (observed while testing a
// double-clicked assembly). Paths are buffered here until a handler exists,
// and a later onOpenFile replaces the handler instead of stacking another
// listener (a re-run of App's effect would otherwise load the file twice).
let openFileHandler = null
const pendingOpenFiles = []
ipcRenderer.on('open-file', (_event, filePath) => {
  if (openFileHandler) openFileHandler(filePath)
  else pendingOpenFiles.push(filePath)
})

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenFile: (callback) => {
    openFileHandler = callback
    while (pendingOpenFiles.length) callback(pendingOpenFiles.shift())
  },
  // Returns a Node Buffer, which structured-clones across the context
  // bridge as a Uint8Array - the renderer wraps it in a File before handing
  // it to the app's normal loadFile() pipeline (same one drag-and-drop and
  // the <input type="file"> picker already use).
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  setTitleBarOverlay: (options) => ipcRenderer.send('set-titlebar-overlay', options),
  // Proprietary CAD formats are opened by the local SOLIDWORKS and handed back
  // as STEP (parts/assemblies) or DXF (drawings) - see main.js.
  convertWithSolidWorks: (filePath) => ipcRenderer.invoke('convert-with-solidworks', filePath),
  // File.path no longer exists in recent Electron: the on-disk path of a
  // dropped or picked file is obtained here instead.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  isElectron: true,
})
