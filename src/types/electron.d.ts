export {}

// Exposed by electron/preload.js via contextBridge - absent entirely when
// running as a plain web page, so every access goes through the optional
// chaining this type forces at every call site.
export interface SolidWorksConversion {
  ok: boolean
  code?: string
  message?: string
  name?: string
  kind?: 'step' | 'dxf'
  bytes?: Uint8Array<ArrayBuffer>
  log?: string[]
}

declare global {
  interface Window {
    electronAPI?: {
      onOpenFile: (callback: (filePath: string) => void) => void
      readFile: (filePath: string) => Promise<Uint8Array<ArrayBuffer>>
      isElectron: true
      // Recolors the OS window buttons overlaid on the custom title bar.
      setTitleBarOverlay?: (options: { color: string; symbolColor: string }) => void
      // Opens a proprietary CAD file in the local SOLIDWORKS and returns a
      // readable copy (STEP or DXF), or an error code - see electron/main.js.
      convertWithSolidWorks?: (filePath: string) => Promise<SolidWorksConversion>
      getPathForFile?: (file: File) => string
    }
  }
}
