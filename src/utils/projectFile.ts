import * as THREE from 'three'
import type {
  Annotation,
  CameraState,
  ClippingAxis,
  DisplayMode,
  Measurement,
  ProjectFile,
  SerializedAnnotation,
  SerializedMeasurement,
} from '../types/model'

export const PROJECT_FILE_VERSION = '1.0'

function vec3ToTuple(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z]
}

function tupleToVec3(t: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(t[0], t[1], t[2])
}

// Two independent FNV-1a-style mixes over the WHOLE buffer in one pass,
// concatenated into a 16-hex-char (64-bit) fingerprint - the non-crypto
// fallback below. Deliberately not "file length + first N bytes": this
// hash exists specifically to tell whether a re-selected source file is
// really the same one a .pindi project was saved against (see
// computeFileHash's own doc comment below), and two different revisions of
// the same STEP file very often share an near-identical header - a
// length-plus-prefix fingerprint would call those "the same file" and
// silently apply the wrong project settings.
function nonCryptoHash(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer)
  let h1 = (0x811c9dc5 ^ buffer.byteLength) >>> 0
  let h2 = (0x1000193 ^ buffer.byteLength) >>> 0
  for (let i = 0; i < view.length; i++) {
    const byte = view[i]
    h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0
    h2 = (h2 + byte) >>> 0
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0
    h2 = (h2 ^ (h2 >>> 13)) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

// SHA-256 of the exact source file bytes, hex-encoded - lets a reloaded
// .pindi project tell whether the STEP/STL/OBJ the user selects to go with
// it is actually the same file it was saved against, not just a same-named
// one that's since changed. crypto.subtle only exists in a secure context
// (HTTPS, or localhost) - plain HTTP throws "crypto.subtle is undefined",
// so this falls back to a fast non-cryptographic hash of the same full
// buffer there instead. Either way the result is just an opaque comparison
// key (never verified against anything external), so a non-cryptographic
// fallback doesn't weaken what this is actually used for.
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      // Falls through to the non-crypto hash below.
    }
  }
  return nonCryptoHash(buffer)
}

export function serializeMeasurement(m: Measurement): SerializedMeasurement {
  return {
    type: m.type,
    point1: vec3ToTuple(m.point1),
    point2: m.point2 ? vec3ToTuple(m.point2) : null,
    distance: m.distance,
    radius: m.radius,
    center: m.center ? vec3ToTuple(m.center) : null,
    axis: m.axis ? vec3ToTuple(m.axis) : null,
    startAngle: m.startAngle,
    angularSpan: m.angularSpan,
    approx: m.approx,
  }
}

export function deserializeMeasurement(id: string, m: SerializedMeasurement): Measurement {
  return {
    id,
    type: m.type,
    point1: tupleToVec3(m.point1),
    point2: m.point2 ? tupleToVec3(m.point2) : null,
    distance: m.distance,
    radius: m.radius,
    center: m.center ? tupleToVec3(m.center) : null,
    axis: m.axis ? tupleToVec3(m.axis) : null,
    startAngle: m.startAngle,
    angularSpan: m.angularSpan,
    approx: m.approx,
  }
}

export function serializeAnnotation(a: Annotation): SerializedAnnotation {
  return { id: a.id, text: a.text, position: vec3ToTuple(a.position) }
}

export function deserializeAnnotation(a: SerializedAnnotation): Annotation {
  return { id: a.id, text: a.text, position: tupleToVec3(a.position) }
}

export interface BuildProjectFileInput {
  projectName: string
  sourceFile: string
  sourceFileHash: string
  camera: CameraState
  displayMode: DisplayMode
  colors: Record<string, string>
  visibility: Record<string, boolean>
  opacity: Record<string, number>
  measurements: Measurement[]
  clippingEnabled: boolean
  clippingAxis: ClippingAxis
  clippingPosition: number
  annotations: Annotation[]
}

export function buildProjectFile(input: BuildProjectFileInput): ProjectFile {
  return {
    version: PROJECT_FILE_VERSION,
    date: new Date().toISOString(),
    projectName: input.projectName,
    sourceFile: input.sourceFile,
    sourceFileHash: input.sourceFileHash,
    camera: input.camera,
    displayMode: input.displayMode,
    colors: input.colors,
    visibility: input.visibility,
    opacity: input.opacity,
    measurements: input.measurements.map(serializeMeasurement),
    clippingPlane: { active: input.clippingEnabled, axis: input.clippingAxis, position: input.clippingPosition },
    animations: [],
    annotations: input.annotations.map(serializeAnnotation),
  }
}

export function serializeProjectFile(project: ProjectFile): string {
  return JSON.stringify(project, null, 2)
}

// Minimal shape validation - not a full schema check, just enough to reject
// an unrelated JSON file (or a future incompatible version) with a clear
// error instead of silently applying garbage settings.
export function parseProjectFile(text: string): ProjectFile {
  const data = JSON.parse(text) as Partial<ProjectFile>
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.version !== 'string' ||
    typeof data.sourceFileHash !== 'string' ||
    typeof data.camera !== 'object'
  ) {
    throw new Error('Fichier .pindi invalide ou corrompu.')
  }
  return {
    version: data.version,
    date: data.date ?? new Date().toISOString(),
    projectName: data.projectName ?? '',
    sourceFile: data.sourceFile ?? '',
    sourceFileHash: data.sourceFileHash,
    camera: data.camera as CameraState,
    displayMode: (data.displayMode ?? 'shaded-edges') as DisplayMode,
    colors: data.colors ?? {},
    visibility: data.visibility ?? {},
    opacity: data.opacity ?? {},
    measurements: data.measurements ?? [],
    clippingPlane: data.clippingPlane ?? { active: false, axis: 'x', position: 0 },
    animations: data.animations ?? [],
    annotations: data.annotations ?? [],
  }
}

function sanitizeFileNamePart(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')
}

export function projectFileName(sourceFile: string): string {
  return `${sanitizeFileNamePart(sourceFile) || 'projet'}_session.pindi`
}

// Blob + URL.createObjectURL + a throwaway <a download> click - the
// standard dependency-free way to trigger a browser download of
// client-generated content (no server round-trip involved).
export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
