// The single list of geometry formats the viewer opens by itself, in the
// browser as well as in Electron. The loader (useFileLoader), the file
// pickers' "accept", the drop-zone hint and the Aide table all derive from
// it, so adding a format here is enough on the web side. (electron/main.js
// is CommonJS and keeps its own copy for the native dialog and file
// associations - keep them in sync.)

export type GeometryLoaderKind = 'step' | 'iges' | 'brep' | 'stl' | 'obj' | '3dxml' | 'dxf'

export interface GeometryFormat {
  label: string
  extensions: string[]
  loader: GeometryLoaderKind
  engine: string
  precision: string
}

export const GEOMETRY_FORMATS: GeometryFormat[] = [
  { label: 'STEP', extensions: ['step', 'stp'], loader: 'step', engine: 'occt-import-js (WASM)', precision: 'Maillage OpenCascade (finesse au choix)' },
  { label: 'IGES', extensions: ['iges', 'igs'], loader: 'iges', engine: 'occt-import-js (WASM)', precision: 'Maillage OpenCascade (finesse au choix)' },
  { label: 'BREP OpenCascade', extensions: ['brep'], loader: 'brep', engine: 'occt-import-js (WASM)', precision: 'Maillage OpenCascade (finesse au choix)' },
  { label: 'STL', extensions: ['stl'], loader: 'stl', engine: 'Three.js STLLoader', precision: 'Triangulée' },
  { label: 'OBJ', extensions: ['obj'], loader: 'obj', engine: 'Three.js OBJLoader', precision: 'Triangulée' },
  { label: '3DXML (CATIA V6)', extensions: ['3dxml'], loader: '3dxml', engine: 'Lecteur intégré (zip + XML)', precision: 'Maillage enregistré dans le fichier' },
  { label: 'DXF 2D/3D', extensions: ['dxf'], loader: 'dxf', engine: 'Lecteur intégré (ASCII)', precision: 'Traits exacts (affichés en rubans), unités $INSUNITS → mm' },
]

// Proprietary formats with no open reader: in the desktop app they are opened
// by the local SOLIDWORKS and handed back as STEP (parts, assemblies) or DXF
// (drawings) - see electron/solidworks-convert.ps1. The web version cannot.
// Keep in sync with SOLIDWORKS_FILE_RE in electron/main.js.
export interface BridgeFormat {
  label: string
  extensions: string[]
}

export const SOLIDWORKS_BRIDGE_FORMATS: BridgeFormat[] = [
  { label: 'SOLIDWORKS (pièce, assemblage, mise en plan, modèles)', extensions: ['sldprt', 'sldasm', 'slddrw', 'prtdot', 'asmdot', 'drwdot'] },
  { label: 'eDrawings', extensions: ['eprt', 'easm', 'edrw'] },
  { label: 'Parasolid', extensions: ['x_t', 'x_b', 'xmt_txt', 'xmt_bin'] },
  { label: 'ACIS', extensions: ['sat', 'sab'] },
  { label: 'JT', extensions: ['jt'] },
  { label: 'Autodesk Inventor', extensions: ['ipt', 'iam'] },
  { label: 'CATIA V5', extensions: ['catpart', 'catproduct'] },
  { label: 'NX / Unigraphics, Pro/Engineer / Creo', extensions: ['prt', 'asm', 'neu', 'xas', 'xpr'] },
  { label: 'Solid Edge', extensions: ['par', 'psm'] },
  { label: 'DWG (AutoCAD)', extensions: ['dwg'] },
  { label: 'CALS', extensions: ['cal', 'ct1'] },
]

const BRIDGE_EXTENSIONS = SOLIDWORKS_BRIDGE_FORMATS.flatMap((f) => f.extensions)

// Creo / Pro-E / NX files often carry a version suffix ("carter.prt.3"):
// the real extension is the one before the number.
export function bridgeFormatForName(fileName: string): BridgeFormat | undefined {
  const parts = fileName.toLowerCase().split('.')
  let ext = parts.pop() ?? ''
  if (/^\d+$/.test(ext) && parts.length > 1) ext = parts.pop() ?? ''
  return BRIDGE_EXTENSIONS.includes(ext) ? SOLIDWORKS_BRIDGE_FORMATS.find((f) => f.extensions.includes(ext)) : undefined
}

// Only the desktop app can reach SOLIDWORKS.
export const canUseSolidWorksBridge = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.convertWithSolidWorks === 'function'

// French messages for the converter's error codes (the PowerShell script only
// emits ASCII codes - see solidworks-convert.ps1).
export const SOLIDWORKS_ERRORS: Record<string, string> = {
  SOLIDWORKS_NOT_RUNNING: "SOLIDWORKS n'est pas ouvert : lancez-le, puis rouvrez le fichier.",
  INPUT_NOT_FOUND: 'Fichier introuvable sur le disque.',
  OPEN_FAILED: "SOLIDWORKS n'a pas pu ouvrir ce fichier (format non pris en charge par cette installation, fichier protégé ou références manquantes).",
  EXPORT_FAILED: "SOLIDWORKS a ouvert le fichier mais n'a pas pu l'exporter.",
  EMPTY_EXPORT:
    "SOLIDWORKS a exporté un fichier sans géométrie. Cela arrive quand un import précédent s'est bloqué : redémarrez SOLIDWORKS puis réessayez.",
  TIMEOUT:
    "SOLIDWORKS n'a pas terminé en 10 minutes. Regardez sa fenêtre : une boîte de dialogue ou une barre de progression peut attendre (références introuvables…).",
  NOT_WINDOWS: 'La conversion par SOLIDWORKS ne fonctionne que sous Windows.',
  BAD_OUTPUT: 'Réponse inattendue du script de conversion.',
  READ_FAILED: 'Le fichier converti est illisible.',
  TEMP_FAILED: 'Impossible de créer le dossier temporaire de conversion.',
  EXCEPTION: 'Erreur SOLIDWORKS pendant la conversion.',
}

export function formatForExtension(ext: string): GeometryFormat | undefined {
  const e = ext.toLowerCase()
  return GEOMETRY_FORMATS.find((f) => f.extensions.includes(e))
}

export const GEOMETRY_EXTENSIONS = GEOMETRY_FORMATS.flatMap((f) => f.extensions)
// In the desktop app the pickers also offer the formats opened through SOLIDWORKS.
const pickerExtensions = [...GEOMETRY_EXTENSIONS, ...(canUseSolidWorksBridge() ? BRIDGE_EXTENSIONS : [])]
export const GEOMETRY_FILE_ACCEPT = pickerExtensions.map((e) => `.${e}`).join(',')
export const OPEN_FILE_ACCEPT = `${GEOMETRY_FILE_ACCEPT},.pindi`
// Short hint for the drop zone, e.g. ".step · .stp · .iges · …".
export const GEOMETRY_EXTENSIONS_HINT = GEOMETRY_EXTENSIONS.map((e) => `.${e}`).join(' · ')
