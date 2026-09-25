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

export function formatForExtension(ext: string): GeometryFormat | undefined {
  const e = ext.toLowerCase()
  return GEOMETRY_FORMATS.find((f) => f.extensions.includes(e))
}

export const GEOMETRY_EXTENSIONS = GEOMETRY_FORMATS.flatMap((f) => f.extensions)
export const GEOMETRY_FILE_ACCEPT = GEOMETRY_EXTENSIONS.map((e) => `.${e}`).join(',')
export const OPEN_FILE_ACCEPT = `${GEOMETRY_FILE_ACCEPT},.pindi`
// Short hint for the drop zone, e.g. ".step · .stp · .iges · …".
export const GEOMETRY_EXTENSIONS_HINT = GEOMETRY_EXTENSIONS.map((e) => `.${e}`).join(' · ')
