import type * as THREE from 'three'

export type DisplayMode =
  | 'shaded-edges'
  | 'shaded'
  | 'wireframe'
  | 'hidden-lines-visible'
  | 'hidden-lines-removed'
  | 'realistic'

// Left-drag behaviour chosen with the navigation buttons (Sélectionner,
// Translater, Rotation, Zoom) - see useModelState's navMode.
export type NavMode = 'select' | 'pan' | 'rotate' | 'zoom'

// A rectangle in viewport pixels (origin top-left of the 3D view).
export interface ScreenRect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso'

export type ClippingAxis = 'x' | 'y' | 'z'

export type ColorMode = 'standard' | 'palette'

export type Theme = 'dark' | 'light' | 'solidworks'

export type MeasurementType = 'distance' | 'diameter'

export interface Measurement {
  id: string
  type: MeasurementType
  point1: THREE.Vector3
  point2: THREE.Vector3 | null
  distance: number | null
  radius: number | null
  center: THREE.Vector3 | null
  axis: THREE.Vector3 | null
  startAngle: number | null
  angularSpan: number | null
  approx: boolean
  // Where the cote line itself is drawn, when it isn't simply point1 ->
  // point2: a drawing-style cote pulled OUTSIDE the part, joined to the
  // measured points by extension lines (e.g. the height between two
  // coaxial rims, see resolveGapMeasurement). Absent on older measurements.
  dimLine?: [THREE.Vector3, THREE.Vector3] | null
}

export interface RotationAxes {
  x: boolean
  y: boolean
  z: boolean
}

export interface ContinuousRotationState {
  active: boolean
  axes: RotationAxes
  speed: number // turns per second
  direction: 1 | -1
}

export type TimedAnimationKind = 'rotation' | 'translation'
export type TimedAnimationMode = 'once' | 'yoyo'

export interface TimedAnimationState {
  kind: TimedAnimationKind
  axis: ClippingAxis
  mode: TimedAnimationMode
  targetValue: number // degrees for a rotation, millimeters for a translation
  duration: number // seconds
  // Stop the motion (and flag the pair red) at the first NEW contact with
  // another part - see collision.ts.
  stopOnCollision?: boolean
  active: boolean
  // Bumped every time a new timed animation is (re)started, so the runtime
  // loop can tell "still the same run in progress" from "the user just
  // clicked Tourner/Déplacer again" even when the axis/target/duration are
  // unchanged from the previous run.
  runId: number
}

export interface NodeAnimationState {
  continuousRotation: ContinuousRotationState
  timed: TimedAnimationState | null
}

export interface InitialTransform {
  position: THREE.Vector3
  rotation: THREE.Euler
}

// A one-shot instruction for the 3D scene to physically reset a pivot's
// (or every pivot's) transform - `requestId` changes on every request so
// the same node can be reset twice in a row and still be observed as a new
// event.
export interface ResetSignal {
  nodeId: string | null
  all: boolean
  requestId: number
}

export interface DiameterGroup {
  radius: number
  count: number
  center: THREE.Vector3
  axis: THREE.Vector3
  // true/false only when at least one member came from a surface patch
  // (which knows concavity - see surfacePatches.ts); null when every member
  // is a pure edge-loop circle, which carries no concavity information.
  concave: boolean | null
  instanceCenters: THREE.Vector3[]
}

export interface PitchCircleInfo {
  diameter: number
  center: THREE.Vector3
  axis: THREE.Vector3
  angleStep: number | null // radians; null when the holes aren't evenly spaced
  holeCount: number
}

export interface HeightLevel {
  label: string
  value: number
}

export interface TopSegment {
  length: number
  a: THREE.Vector3
  b: THREE.Vector3
}

// One planar face level along a world axis (every flat face whose normal
// points along that axis, at that coordinate), with the world-space extents
// of those faces - where the auto-dimension extension lines start from.
export interface AxisLevel {
  pos: number
  min: THREE.Vector3
  max: THREE.Vector3
  area: number
}

export interface DimensionReport {
  nodeId: string
  name: string
  size: THREE.Vector3
  boundingBoxMin: THREE.Vector3
  boundingBoxMax: THREE.Vector3
  diameterGroups: DiameterGroup[]
  largestGroupIndex: number | null
  centralBoreGroupIndex: number | null
  pitchCircle: PitchCircleInfo | null
  heights: HeightLevel[]
  axisLevels: { x: AxisLevel[]; y: AxisLevel[]; z: AxisLevel[] }
  topSegments: TopSegment[]
  volumeMm3: number
  surfaceMm2: number
  triangleCount: number
}

export interface Annotation {
  id: string
  text: string
  position: THREE.Vector3
}

export type AiChatRole = 'user' | 'assistant' | 'system'

export interface AiChatMessage {
  id: string
  role: AiChatRole
  text: string
}

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

// A measurement with every THREE.Vector3 flattened to a plain [x,y,z]
// tuple - the JSON-serializable form saved into and loaded back from a
// .pindi project file (see projectFile.ts).
export interface SerializedMeasurement {
  type: MeasurementType
  point1: [number, number, number]
  point2: [number, number, number] | null
  distance: number | null
  radius: number | null
  center: [number, number, number] | null
  axis: [number, number, number] | null
  startAngle: number | null
  angularSpan: number | null
  approx: boolean
  dimLine?: [[number, number, number], [number, number, number]] | null
}

export interface SerializedAnnotation {
  id: string
  text: string
  position: [number, number, number]
}

export interface ProjectClippingState {
  active: boolean
  axis: ClippingAxis
  position: number
  // Absent from projects saved before the "Inverser le côté" button.
  flipped?: boolean
}

// The on-disk shape of a .pindi project save file - a JSON snapshot of
// every viewer setting that isn't part of the source CAD geometry itself,
// keyed back to that source file by name and content hash so a reload can
// tell whether the file the user re-selects is actually the right one.
// The CAD file a project was saved from, carried inside the .pindi so the
// project opens on its own (see embeddedSource.ts).
export interface EmbeddedSource {
  name: string
  size: number
  encoding: 'gzip-base64' | 'base64'
  data: string
}

// A user-made group as saved in a .pindi file: the group's own id/name plus the
// ids of its direct children (parts or other groups), in tree order.
export interface GroupRecord {
  id: string
  name: string
  childIds: string[]
}

export interface ProjectFile {
  version: string
  date: string
  projectName: string
  sourceFile: string
  sourceFileHash: string
  camera: CameraState
  displayMode: DisplayMode
  colors: Record<string, string>
  visibility: Record<string, boolean>
  opacity: Record<string, number>
  // Names the user gave to parts/groups (node id -> name). Absent in projects
  // saved before renaming existed.
  names?: Record<string, string>
  // Groups made with "Grouper" (see GroupRecord); rebuilt on open.
  groups?: GroupRecord[]
  // "Couleurs par pièce" on/off and, after "Couleur aléatoire", the series
  // (shape-group index -> 0xRRGGBB) that was on screen when saving.
  colorMode?: ColorMode
  paletteColors?: Record<string, number>
  // Pièces sélectionnées au moment de l'enregistrement (ids de noeuds).
  selection?: string[]
  // Réglages du module Impression 3D (voir usePrintStore.snapshotPrintState).
  print?: Record<string, unknown>
  measurements: SerializedMeasurement[]
  clippingPlane: ProjectClippingState
  animations: unknown[]
  annotations: SerializedAnnotation[]
  embeddedSource?: EmbeddedSource
}

export interface ComponentNode {
  id: string
  name: string
  mesh: THREE.Mesh | null
  children: ComponentNode[]
  // true only for a folder node created by the user via "Créer un groupe"
  // (see useModelState.ts's createGroup) - as opposed to a folder node that
  // came from the source STEP assembly's own hierarchy, which also has
  // mesh: null but isn't user-ungroupable.
  isGroup?: boolean
}

export interface LoadResult {
  object: THREE.Group
  triangleCount: number
  tree: ComponentNode
  // True when a STEP model came from the persistent mesh cache (no parse).
  fromCache?: boolean
}
