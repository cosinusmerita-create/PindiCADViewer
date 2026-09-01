const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, filePath) => callback(filePath)),
  // Returns a Node Buffer, which structured-clones across the context
  // bridge as a Uint8Array - the renderer wraps it in a File before handing
  // it to the app's normal loadFile() pipeline (same one drag-and-drop and
  // the <input type="file"> picker already use).
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  isElectron: true,
})
