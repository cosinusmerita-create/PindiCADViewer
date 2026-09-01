export {}

// Exposed by electron/preload.js via contextBridge - absent entirely when
// running as a plain web page, so every access goes through the optional
// chaining this type forces at every call site.
declare global {
  interface Window {
    electronAPI?: {
      onOpenFile: (callback: (filePath: string) => void) => void
      readFile: (filePath: string) => Promise<Uint8Array<ArrayBuffer>>
      isElectron: true
    }
  }
}
