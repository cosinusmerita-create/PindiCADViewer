import { create } from 'zustand'
import * as THREE from 'three'
import type {
  Annotation,
  AiChatMessage,
  CameraState,
  ClippingAxis,
  ColorMode,
  ComponentNode,
  DimensionReport,
  DisplayMode,
  InitialTransform,
  Measurement,
  NodeAnimationState,
  ProjectFile,
  ResetSignal,
  Theme,
  TimedAnimationKind,
  TimedAnimationMode,
  ViewPreset,
} from '../types/model'
import {
  applyColor,
  applyColorModeToTree,
  applyOpacity,
  applyVisibility,
  collectNodeIds,
  collectPartNodeIds,
  findNodeById,
  removeNodeById,
} from '../utils/componentTree'
import { buildDimensionReport } from '../utils/dimensioning'
import { deserializeAnnotation, deserializeMeasurement } from '../utils/projectFile'
import type { MeshEdgeData } from '../utils/edgeAnalysis'
import { FLUID_TYPES, type FlowFluidType } from '../utils/fluidTypes'
import type { FlowAxis, FlowTrajectoryShape } from '../utils/flowTrajectory'
import type { SnapResult } from '../utils/snapping'
import { parseAiPlan, resolveAiTarget, type AiIntent, type AiTarget } from '../utils/aiAssistant'
import { encodeSelectionKey } from '../utils/selectionKey'
import { findFlowPassages, type FlowPassage } from '../utils/flowPassages'
import { buildWaypointFlowPath, canUseDefaultInjectionWaypoints, findAutoFlowPath, DEFAULT_INJECTION_WAYPOINTS } from '../utils/flowPathBuilder'

const AUTO_DIMENSION_OPACITY = 0.6
const FLOW_OPACITY = 0.35
export const THEME_STORAGE_KEY = 'pindi-theme'

// Computed once at store creation so the very first render already has the
// right theme (localStorage first, then the system's own light/dark
// preference, dark otherwise) - App.tsx's mount effect then just syncs the
// DOM class/localStorage to whatever this resolves to, rather than being
// the source of truth itself.
function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'solidworks') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

export const DEFAULT_CONTINUOUS_ROTATION: NodeAnimationState['continuousRotation'] = {
  active: false,
  axes: { x: false, y: false, z: false },
  speed: 0.5,
  direction: 1,
}

export const DEFAULT_NODE_ANIMATION: NodeAnimationState = {
  continuousRotation: DEFAULT_CONTINUOUS_ROTATION,
  timed: null,
}

interface ModelState {
  object: THREE.Group | null
  fileName: string | null
  triangleCount: number
  boundingBox: THREE.Box3 | null
  tree: ComponentNode | null
  visibility: Record<string, boolean>
  opacity: Record<string, number>
  customColors: Record<string, string>
  colorMode: ColorMode
  displayMode: DisplayMode
  showGrid: boolean
  isLoading: boolean
  error: string | null
  resetView: (() => void) | null
  goToView: ((preset: ViewPreset) => void) | null
  clippingEnabled: boolean
  clippingAxis: ClippingAxis
  clippingPosition: number
  contextMenu: ContextMenuState | null
  selectedNodeIds: string[]
  selectionAnchorId: string | null
  boxSelectMode: boolean
  showGroupNamePrompt: boolean
  pipetteMode: boolean
  pickedColor: string | null
  measureMode: boolean
  measurements: Measurement[]
  measurePendingPoint: THREE.Vector3 | null
  measurePendingSnap: SnapResult | null
  // Screen-space position of the active touch point while measuring, set
  // only for touch pointers - lets a DOM overlay outside the canvas (see
  // Viewer3D()) draw a crosshair offset above the finger, since the finger
  // itself hides the actual touch point from view.
  measureTouchScreenPos: { x: number; y: number } | null
  edgeData: Map<string, MeshEdgeData>
  animations: Record<string, NodeAnimationState>
  initialTransforms: Record<string, InitialTransform>
  animationsPaused: boolean
  explodeFactor: number
  resetSignal: ResetSignal | null
  timedRunCounter: number
  showAutoDimensions: boolean
  dimensionTargetNodeId: string | null
  dimensionReport: DimensionReport | null
  dimensionsOpacitySnapshot: Record<string, number> | null
  sourceFileHash: string | null
  projectName: string
  annotationMode: boolean
  annotations: Annotation[]
  pendingAnnotation: { point: THREE.Vector3; x: number; y: number } | null
  // Click-to-place mode for the water-flow illustration: each click on the
  // model appends a point to `flowPath`, tracing the fluid's actual route
  // through the assembly (e.g. in through a sleeve, out through a shaft's
  // bore) - not persisted to the .pindi project file, it's a transient
  // viewer aid tied to whatever's currently loaded, same as hover previews.
  flowPickMode: boolean
  flowPath: THREE.Vector3[]
  // Index into `flowPath` currently armed for repositioning (clicked once
  // on its marker) - the NEXT click on the model moves that point there
  // instead of appending a new one, so a single misplaced point can be
  // fixed without undoing everything placed after it.
  flowEditPointIndex: number | null
  flowPlaying: boolean
  flowSpeed: number
  flowFluidType: FlowFluidType
  // "linear" follows the picked points directly (a CatmullRomCurve3); "circular"
  // instead sweeps a circle/helix fitted through those same points, for a
  // cylindrical chamber's swirl/vortex rather than a straight-through path.
  flowTrajectoryShape: FlowTrajectoryShape
  flowCircularAxis: FlowAxis
  flowCircularTurns: number
  flowOpacitySnapshot: Record<string, number> | null
  // Auto-detected straight-through passages (see flowPassages.ts),
  // (re)computed whenever flow-pick mode turns on - offered as a
  // one-click shortcut instead of manually clicking both ends.
  flowPassageCandidates: FlowPassage[]
  flowPassageIndex: number
  // Local, rule-based natural-language command panel (see aiAssistant.ts) -
  // no network call, no API key: see AnimationAssistant.tsx for why this
  // isn't wired to a hosted LLM on a public static site.
  aiChatOpen: boolean
  aiChatMessages: AiChatMessage[]
  aiChatInputHistory: string[]
  // Non-null while a multi-step AI plan ("select" then act, or a whole
  // démontage/remontage sequence) is running - lets the panel show "Étape
  // X/Y" and the Stop button interrupt it between steps.
  aiSequenceActive: boolean
  aiSequenceProgress: { step: number; total: number } | null
  captureFourViews: (() => Promise<Record<'iso' | 'front' | 'top' | 'right', string>>) | null
  getCameraState: (() => CameraState) | null
  applyCameraState: ((state: CameraState) => void) | null
  capturePng: ((transparent: boolean) => string) | null
  getPartScreenPositions: (() => { id: string; x: number; y: number }[]) | null
  setModel: (
    object: THREE.Group,
    fileName: string,
    triangleCount: number,
    boundingBox: THREE.Box3,
    tree: ComponentNode,
    edgeData: Map<string, MeshEdgeData>,
  ) => void
  clearModel: () => void
  toggleAiChat: () => void
  sendAiChatMessage: (text: string) => Promise<void>
  stopAiSequence: () => void
  clearAiChat: () => void
  setDisplayMode: (mode: DisplayMode) => void
  setShowGrid: (show: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setResetView: (fn: (() => void) | null) => void
  setGoToView: (fn: ((preset: ViewPreset) => void) | null) => void
  toggleComponentVisibility: (id: string) => void
  setNodeOpacity: (id: string, opacity: number) => void
  setAllOpacity: (opacity: number) => void
  setNodeColor: (id: string, color: string) => void
  resetNodeColor: (id: string) => void
  resetAllColors: () => void
  setColorMode: (mode: ColorMode) => void
  setClippingEnabled: (enabled: boolean) => void
  setClippingAxis: (axis: ClippingAxis) => void
  setClippingPosition: (position: number) => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  selectNode: (id: string | null) => void
  toggleNodeSelection: (id: string) => void
  selectRange: (id: string) => void
  setBoxSelection: (ids: string[], additive: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  invertSelection: () => void
  toggleBoxSelectMode: () => void
  exitBoxSelectMode: () => void
  setColorForSelection: (color: string, ids?: string[]) => void
  setOpacityForSelection: (opacity: number, ids?: string[]) => void
  setVisibilityForSelection: (visible: boolean, ids?: string[]) => void
  resetColorForSelection: (ids?: string[]) => void
  setGetPartScreenPositions: (fn: (() => { id: string; x: number; y: number }[]) | null) => void
  createGroup: (name: string) => void
  ungroupNode: (groupId: string) => void
  setShowGroupNamePrompt: (show: boolean) => void
  togglePipetteMode: () => void
  exitPipetteMode: () => void
  setPickedColor: (color: string | null) => void
  toggleMeasureMode: () => void
  exitMeasureMode: () => void
  addMeasurement: (measurement: Measurement) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void
  setMeasurePendingPoint: (point: THREE.Vector3 | null) => void
  setMeasurePendingSnap: (snap: SnapResult | null) => void
  setMeasureTouchScreenPos: (pos: { x: number; y: number } | null) => void
  setContinuousRotationAxis: (nodeId: string, axis: 'x' | 'y' | 'z', enabled: boolean) => void
  setContinuousRotationSpeed: (nodeId: string, speed: number) => void
  setContinuousRotationDirection: (nodeId: string, direction: 1 | -1) => void
  setContinuousRotationActive: (nodeId: string, active: boolean) => void
  startPresentation: (nodeId: string, speed: number) => void
  startTimedAnimation: (
    nodeId: string,
    config: { kind: TimedAnimationKind; axis: 'x' | 'y' | 'z'; mode: TimedAnimationMode; targetValue: number; duration: number },
  ) => void
  markTimedAnimationFinished: (nodeId: string) => void
  setAnimationsPaused: (paused: boolean) => void
  setExplodeFactor: (factor: number) => void
  requestNodeReset: (nodeId: string) => void
  requestResetAll: () => void
  registerInitialTransform: (nodeId: string, position: THREE.Vector3, rotation: THREE.Euler) => void
  toggleAutoDimensions: () => void
  setDimensionTargetNodeId: (nodeId: string | null) => void
  setSourceFileHash: (hash: string | null) => void
  applyProjectFile: (project: ProjectFile) => void
  setProjectName: (name: string) => void
  toggleAnnotationMode: () => void
  exitAnnotationMode: () => void
  toggleFlowPickMode: () => void
  exitFlowPickMode: () => void
  addFlowPathPoint: (point: THREE.Vector3) => void
  addFlowPathPointRelative: (axis: 'x' | 'y' | 'z', distance: number, angleDeg: number) => void
  selectFlowPathPoint: (index: number | null) => void
  moveFlowPathPoint: (index: number, point: THREE.Vector3) => void
  reverseFlowPath: () => void
  undoFlowPathPoint: () => void
  clearFlowPath: () => void
  setFlowPlaying: (playing: boolean) => void
  setFlowSpeed: (speed: number) => void
  setFlowFluidType: (fluidType: FlowFluidType) => void
  setFlowTrajectoryShape: (shape: FlowTrajectoryShape) => void
  setFlowCircularAxis: (axis: FlowAxis) => void
  setFlowCircularTurns: (turns: number) => void
  nextFlowPassage: () => void
  useFlowPassage: (reversed: boolean) => void
  dismissFlowPassages: () => void
  setPendingAnnotation: (pending: { point: THREE.Vector3; x: number; y: number } | null) => void
  addAnnotation: (text: string) => void
  removeAnnotation: (id: string) => void
  setCaptureFourViews: (fn: (() => Promise<Record<'iso' | 'front' | 'top' | 'right', string>>) | null) => void
  setGetCameraState: (fn: (() => CameraState) | null) => void
  setApplyCameraState: (fn: ((state: CameraState) => void) | null) => void
  setCapturePng: (fn: ((transparent: boolean) => string) | null) => void
  showHelp: boolean
  toggleHelp: () => void
  setShowHelp: (show: boolean) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  pindiSourcePrompt: { sourceFile: string; resolve: (file: File | null) => void } | null
  setPindiSourcePrompt: (prompt: { sourceFile: string; resolve: (file: File | null) => void } | null) => void
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (value: boolean) => void
  showCloseConfirm: boolean
  setShowCloseConfirm: (value: boolean) => void
}

// Bumped on every new AI command and on stopAiSequence() - an in-flight
// sendAiChatMessage loop checks this before each step/wait and bails out
// as soon as it no longer matches, without needing this in reactive
// zustand state (only the user-visible aiSequenceActive/Progress are).
let aiSequenceToken = 0

// Hard-coded per this project's own tête d'injection assembly (see project
// notes) - mirrors flowPathBuilder.ts's DEFAULT_INJECTION_WAYPOINTS
// precedent: only ever used when the named parts actually exist in the
// loaded model, skipped step-by-step otherwise.
const DISASSEMBLE_TEMPLATE: { keyword: string; axis: 'x' | 'y' | 'z'; distance: number; duration: number }[] = [
  { keyword: 'vis', axis: 'y', distance: 60, duration: 1.5 },
  { keyword: 'flasque_haut', axis: 'y', distance: 80, duration: 2 },
  { keyword: 'joint', axis: 'x', distance: 60, duration: 1.5 },
]

function buildDisassembleSequence(tree: ComponentNode, mode: 'demonte' | 'remonte'): AiIntent[] {
  const steps = mode === 'remonte' ? [...DISASSEMBLE_TEMPLATE].reverse() : DISASSEMBLE_TEMPLATE
  const plan: AiIntent[] = []
  for (const step of steps) {
    if (resolveAiTarget(tree, [], { keyword: step.keyword }).ids.length === 0) continue
    plan.push({ kind: 'select', target: { keyword: step.keyword } })
    plan.push({
      kind: 'translate',
      target: 'selected',
      axis: step.axis,
      distance: mode === 'remonte' ? -step.distance : step.distance,
      duration: step.duration,
    })
  }
  return plan
}

export const useModelStore = create<ModelState>((set, get) => ({
  object: null,
  fileName: null,
  triangleCount: 0,
  boundingBox: null,
  tree: null,
  visibility: {},
  opacity: {},
  customColors: {},
  colorMode: 'standard',
  displayMode: 'shaded-edges',
  showGrid: false,
  isLoading: false,
  error: null,
  resetView: null,
  goToView: null,
  clippingEnabled: false,
  clippingAxis: 'x',
  clippingPosition: 0,
  contextMenu: null,
  selectedNodeIds: [],
  selectionAnchorId: null,
  boxSelectMode: false,
  showGroupNamePrompt: false,
  pipetteMode: false,
  pickedColor: null,
  measureMode: false,
  measurements: [],
  measurePendingPoint: null,
  measurePendingSnap: null,
  measureTouchScreenPos: null,
  edgeData: new Map(),
  animations: {},
  initialTransforms: {},
  animationsPaused: false,
  explodeFactor: 0,
  resetSignal: null,
  timedRunCounter: 0,
  showAutoDimensions: false,
  dimensionTargetNodeId: null,
  dimensionReport: null,
  dimensionsOpacitySnapshot: null,
  sourceFileHash: null,
  projectName: '',
  annotationMode: false,
  annotations: [],
  pendingAnnotation: null,
  flowPickMode: false,
  flowPath: [],
  flowEditPointIndex: null,
  flowPlaying: false,
  flowSpeed: 0.15,
  flowFluidType: 'water',
  flowTrajectoryShape: 'linear',
  flowCircularAxis: 'y',
  flowCircularTurns: 1,
  flowOpacitySnapshot: null,
  flowPassageCandidates: [],
  flowPassageIndex: 0,
  aiChatOpen: false,
  aiChatMessages: [],
  aiChatInputHistory: [],
  aiSequenceActive: false,
  aiSequenceProgress: null,
  captureFourViews: null,
  getCameraState: null,
  applyCameraState: null,
  capturePng: null,
  getPartScreenPositions: null,
  showHelp: false,
  theme: getInitialTheme(),
  pindiSourcePrompt: null,
  hasUnsavedChanges: false,
  showCloseConfirm: false,

  setModel: (object, fileName, triangleCount, boundingBox, tree, edgeData) => {
    const visibility: Record<string, boolean> = {}
    const opacity: Record<string, number> = {}
    for (const id of collectNodeIds(tree)) {
      visibility[id] = true
      opacity[id] = 1
    }

    // Newly loaded parts start out gray (see the loaders); bring them in
    // line with whichever color mode the viewer is currently set to.
    applyColorModeToTree(tree, get().colorMode, {}, get().theme)

    set({
      object,
      fileName,
      triangleCount,
      boundingBox,
      tree,
      visibility,
      opacity,
      customColors: {},
      error: null,
      clippingEnabled: false,
      clippingAxis: 'x',
      clippingPosition: (boundingBox.min.x + boundingBox.max.x) / 2,
      contextMenu: null,
      selectedNodeIds: [],
      selectionAnchorId: null,
      boxSelectMode: false,
      pipetteMode: false,
      pickedColor: null,
      measureMode: false,
      measurements: [],
      measurePendingPoint: null,
      measurePendingSnap: null,
      edgeData,
      animations: {},
      initialTransforms: {},
      animationsPaused: false,
      explodeFactor: 0,
      resetSignal: null,
      showAutoDimensions: false,
      dimensionTargetNodeId: null,
      dimensionReport: null,
      dimensionsOpacitySnapshot: null,
      sourceFileHash: null,
      projectName: '',
      annotationMode: false,
      annotations: [],
      pendingAnnotation: null,
      flowPickMode: false,
      flowPath: [],
      flowEditPointIndex: null,
      flowPlaying: false,
      flowFluidType: 'water',
      flowTrajectoryShape: 'linear',
      flowOpacitySnapshot: null,
      flowPassageCandidates: [],
      flowPassageIndex: 0,
      hasUnsavedChanges: false,
    })
  },

  clearModel: () =>
    set({
      object: null,
      fileName: null,
      triangleCount: 0,
      boundingBox: null,
      tree: null,
      visibility: {},
      opacity: {},
      customColors: {},
      resetView: null,
      captureFourViews: null,
      getCameraState: null,
      applyCameraState: null,
      capturePng: null,
      getPartScreenPositions: null,
      clippingEnabled: false,
      contextMenu: null,
      selectedNodeIds: [],
      selectionAnchorId: null,
      boxSelectMode: false,
      showGroupNamePrompt: false,
      pipetteMode: false,
      pickedColor: null,
      measureMode: false,
      measurements: [],
      measurePendingPoint: null,
      measurePendingSnap: null,
      edgeData: new Map(),
      animations: {},
      initialTransforms: {},
      animationsPaused: false,
      explodeFactor: 0,
      resetSignal: null,
      showAutoDimensions: false,
      dimensionTargetNodeId: null,
      dimensionReport: null,
      dimensionsOpacitySnapshot: null,
      sourceFileHash: null,
      projectName: '',
      annotationMode: false,
      annotations: [],
      pendingAnnotation: null,
      flowPickMode: false,
      flowPath: [],
      flowEditPointIndex: null,
      flowPlaying: false,
      flowFluidType: 'water',
      flowTrajectoryShape: 'linear',
      flowOpacitySnapshot: null,
      flowPassageCandidates: [],
      flowPassageIndex: 0,
      hasUnsavedChanges: false,
      showCloseConfirm: false,
    }),

  setDisplayMode: (displayMode) => set({ displayMode }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setResetView: (resetView) => set({ resetView }),
  setGoToView: (goToView) => set({ goToView }),

  toggleComponentVisibility: (id) => {
    const { tree, visibility } = get()
    if (!tree) return
    const node = findNodeById(tree, id)
    if (!node) return

    const nextVisible = !(visibility[id] ?? true)
    const affectedIds = applyVisibility(node, nextVisible)

    const nextVisibility = { ...visibility }
    for (const affectedId of affectedIds) nextVisibility[affectedId] = nextVisible
    set({ visibility: nextVisibility, hasUnsavedChanges: true })
  },

  setNodeOpacity: (id, opacity) => {
    const { tree, opacity: opacityMap } = get()
    if (!tree) return
    const node = findNodeById(tree, id)
    if (!node) return

    const affectedIds = applyOpacity(node, opacity)

    const nextOpacity = { ...opacityMap }
    for (const affectedId of affectedIds) nextOpacity[affectedId] = opacity
    set({ opacity: nextOpacity, hasUnsavedChanges: true })
  },

  setAllOpacity: (opacity) => {
    const { tree } = get()
    if (!tree) return
    const affectedIds = applyOpacity(tree, opacity)

    const nextOpacity: Record<string, number> = {}
    for (const affectedId of affectedIds) nextOpacity[affectedId] = opacity
    set({ opacity: nextOpacity, hasUnsavedChanges: true })
  },

  setNodeColor: (id, color) => {
    const { tree, customColors, colorMode, theme } = get()
    if (!tree) return
    const node = findNodeById(tree, id)
    if (!node) return

    const affectedIds = applyColor(node, color, colorMode, theme)

    const next = { ...customColors }
    for (const affectedId of affectedIds) next[affectedId] = color
    set({ customColors: next, hasUnsavedChanges: true })
  },

  resetNodeColor: (id) => {
    const { tree, customColors, colorMode, theme } = get()
    if (!tree) return
    const node = findNodeById(tree, id)
    if (!node) return

    const affectedIds = applyColor(node, null, colorMode, theme)

    const next = { ...customColors }
    for (const affectedId of affectedIds) delete next[affectedId]
    set({ customColors: next, hasUnsavedChanges: true })
  },

  resetAllColors: () => {
    const { tree, colorMode, theme } = get()
    if (!tree) return
    applyColor(tree, null, colorMode, theme)
    set({ customColors: {}, hasUnsavedChanges: true })
  },

  setColorMode: (colorMode) => {
    const { tree, customColors, theme } = get()
    set({ colorMode })
    if (!tree) return
    applyColorModeToTree(tree, colorMode, customColors, theme)
  },

  setClippingEnabled: (clippingEnabled) => set({ clippingEnabled, hasUnsavedChanges: true }),
  setClippingAxis: (clippingAxis) => set({ clippingAxis, hasUnsavedChanges: true }),
  setClippingPosition: (clippingPosition) => set({ clippingPosition, hasUnsavedChanges: true }),

  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),

  // Plain click: replaces the whole selection with just `id` (or clears it,
  // for id === null - the "clicked empty space" case). Also becomes the new
  // shift-range anchor, matching how a fresh click always restarts the
  // range a following shift-click would extend from.
  selectNode: (id) => set({ selectedNodeIds: id ? [id] : [], selectionAnchorId: id }),

  // Ctrl/Cmd+click: adds `id` to the selection, or removes it if already
  // selected. Becomes the new range anchor either way, like most file
  // explorers/design tools do.
  toggleNodeSelection: (id) =>
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.includes(id)
        ? state.selectedNodeIds.filter((existing) => existing !== id)
        : [...state.selectedNodeIds, id],
      selectionAnchorId: id,
    })),

  // Shift+click: selects every node between the last anchor and `id`, in
  // the tree's own (parent-blind) depth-first order - the same order
  // ComponentTree renders rows in when fully expanded. Falls back to a
  // plain single selection if there's no anchor yet (first click of a
  // session) or the anchor no longer exists in the tree.
  selectRange: (id) => {
    const { tree, selectionAnchorId } = get()
    if (!tree) return
    if (!selectionAnchorId) {
      set({ selectedNodeIds: [id], selectionAnchorId: id })
      return
    }
    const order = collectNodeIds(tree)
    const anchorIndex = order.indexOf(selectionAnchorId)
    const targetIndex = order.indexOf(id)
    if (anchorIndex === -1 || targetIndex === -1) {
      set({ selectedNodeIds: [id], selectionAnchorId: id })
      return
    }
    const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
    set({ selectedNodeIds: order.slice(start, end + 1) })
  },

  // Box-select release (see BoxSelectOverlay/Viewer3D.tsx): replaces the
  // selection with everything inside the drag rectangle, or unions it with
  // whatever was already selected when Ctrl/Cmd was held during the drag.
  setBoxSelection: (ids, additive) =>
    set((state) => ({
      selectedNodeIds: additive ? Array.from(new Set([...state.selectedNodeIds, ...ids])) : ids,
      selectionAnchorId: ids[ids.length - 1] ?? state.selectionAnchorId,
    })),

  selectAll: () => {
    const { tree } = get()
    if (!tree) return
    set({ selectedNodeIds: collectPartNodeIds(tree) })
  },

  clearSelection: () => set({ selectedNodeIds: [], selectionAnchorId: null }),

  invertSelection: () => {
    const { tree, selectedNodeIds } = get()
    if (!tree) return
    const selected = new Set(selectedNodeIds)
    set({ selectedNodeIds: collectPartNodeIds(tree).filter((id) => !selected.has(id)) })
  },

  toggleBoxSelectMode: () =>
    set((state) => ({
      boxSelectMode: !state.boxSelectMode,
      pipetteMode: false,
      pickedColor: null,
      measureMode: false,
      measurePendingPoint: null,
      measurePendingSnap: null,
      annotationMode: false,
      pendingAnnotation: null,
      flowPickMode: false,
    })),
  exitBoxSelectMode: () => set({ boxSelectMode: false }),

  // Color/opacity/visibility "for selection" bulk actions - shared by the
  // color picker and opacity slider (ModelInfoPanel/ComponentTree, applied
  // to the whole current selection whenever more than one part is
  // selected), the pipette (Viewer3D.tsx), and the context menu (which
  // passes an explicit `ids` for the "right-clicked a part that isn't part
  // of the current selection" case, rather than touching the selection
  // itself just to run one action).
  setColorForSelection: (color, ids) => {
    const { tree, customColors, colorMode, theme, selectedNodeIds } = get()
    const targetIds = ids ?? selectedNodeIds
    if (!tree || targetIds.length === 0) return
    const next = { ...customColors }
    for (const id of targetIds) {
      const node = findNodeById(tree, id)
      if (!node) continue
      for (const affectedId of applyColor(node, color, colorMode, theme)) next[affectedId] = color
    }
    set({ customColors: next, hasUnsavedChanges: true })
  },

  setOpacityForSelection: (opacity, ids) => {
    const { tree, opacity: opacityMap, selectedNodeIds } = get()
    const targetIds = ids ?? selectedNodeIds
    if (!tree || targetIds.length === 0) return
    const next = { ...opacityMap }
    for (const id of targetIds) {
      const node = findNodeById(tree, id)
      if (!node) continue
      for (const affectedId of applyOpacity(node, opacity)) next[affectedId] = opacity
    }
    set({ opacity: next, hasUnsavedChanges: true })
  },

  setVisibilityForSelection: (visible, ids) => {
    const { tree, visibility, selectedNodeIds } = get()
    const targetIds = ids ?? selectedNodeIds
    if (!tree || targetIds.length === 0) return
    const next = { ...visibility }
    for (const id of targetIds) {
      const node = findNodeById(tree, id)
      if (!node) continue
      for (const affectedId of applyVisibility(node, visible)) next[affectedId] = visible
    }
    set({ visibility: next, hasUnsavedChanges: true })
  },

  resetColorForSelection: (ids) => {
    const { tree, customColors, colorMode, theme, selectedNodeIds } = get()
    const targetIds = ids ?? selectedNodeIds
    if (!tree || targetIds.length === 0) return
    const next = { ...customColors }
    for (const id of targetIds) {
      const node = findNodeById(tree, id)
      if (!node) continue
      for (const affectedId of applyColor(node, null, colorMode, theme)) delete next[affectedId]
    }
    set({ customColors: next, hasUnsavedChanges: true })
  },

  setGetPartScreenPositions: (getPartScreenPositions) => set({ getPartScreenPositions }),

  // Wraps every currently selected node in a new folder node (mesh: null,
  // isGroup: true) inserted at the tree's root, detaching each from
  // wherever it previously lived - see removeNodeById in componentTree.ts.
  // Requires at least 2 selected nodes; a "group" of one part isn't
  // meaningful. The new group becomes the sole selection afterward, so its
  // color/animation controls are immediately available.
  createGroup: (name) => {
    const { tree, selectedNodeIds } = get()
    if (!tree || selectedNodeIds.length < 2) return

    let workingTree = tree
    const detached: ComponentNode[] = []
    for (const id of selectedNodeIds) {
      const result = removeNodeById(workingTree, id)
      workingTree = result.tree
      if (result.removed) detached.push(result.removed)
    }
    if (detached.length < 2) return

    const group: ComponentNode = {
      id: `group-${crypto.randomUUID()}`,
      name,
      mesh: null,
      children: detached,
      isGroup: true,
    }
    set({
      tree: { ...workingTree, children: [...workingTree.children, group] },
      selectedNodeIds: [group.id],
      selectionAnchorId: group.id,
      hasUnsavedChanges: true,
    })
  },

  // Dissolves a user-created group, promoting its direct children back to
  // the tree's root - simpler than restoring each to its original parent
  // (not tracked), and non-destructive either way since every part and its
  // own settings stay exactly as they were, just one level shallower.
  ungroupNode: (groupId) => {
    const { tree } = get()
    if (!tree) return
    const target = findNodeById(tree, groupId)
    if (!target?.isGroup) return

    const { tree: withoutGroup, removed } = removeNodeById(tree, groupId)
    if (!removed) return
    set({
      tree: { ...withoutGroup, children: [...withoutGroup.children, ...removed.children] },
      selectedNodeIds: removed.children.map((child) => child.id),
      selectionAnchorId: null,
      hasUnsavedChanges: true,
    })
  },

  setShowGroupNamePrompt: (showGroupNamePrompt) => set({ showGroupNamePrompt }),

  togglePipetteMode: () =>
    set((state) => ({
      pipetteMode: !state.pipetteMode,
      pickedColor: null,
      measureMode: false,
      measurePendingPoint: null,
      measurePendingSnap: null,
      boxSelectMode: false,
      flowPickMode: false,
    })),
  exitPipetteMode: () => set({ pipetteMode: false, pickedColor: null }),
  setPickedColor: (pickedColor) => set({ pickedColor }),

  toggleMeasureMode: () =>
    set((state) => ({
      measureMode: !state.measureMode,
      measurePendingPoint: null,
      measurePendingSnap: null,
      pipetteMode: false,
      pickedColor: null,
      boxSelectMode: false,
      flowPickMode: false,
    })),
  exitMeasureMode: () =>
    set({ measureMode: false, measurePendingPoint: null, measurePendingSnap: null, measureTouchScreenPos: null }),
  addMeasurement: (measurement) =>
    set((state) => ({ measurements: [...state.measurements, measurement], hasUnsavedChanges: true })),
  removeMeasurement: (id) =>
    set((state) => ({
      measurements: state.measurements.filter((m) => m.id !== id),
      hasUnsavedChanges: true,
    })),
  clearMeasurements: () => set({ measurements: [], hasUnsavedChanges: true }),
  setMeasurePendingPoint: (measurePendingPoint) => set({ measurePendingPoint }),
  setMeasurePendingSnap: (measurePendingSnap) => set({ measurePendingSnap }),
  setMeasureTouchScreenPos: (measureTouchScreenPos) => set({ measureTouchScreenPos }),

  setContinuousRotationAxis: (nodeId, axis, enabled) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      return {
        animations: {
          ...state.animations,
          [nodeId]: {
            ...existing,
            continuousRotation: {
              ...existing.continuousRotation,
              axes: { ...existing.continuousRotation.axes, [axis]: enabled },
            },
          },
        },
        hasUnsavedChanges: true,
      }
    }),

  setContinuousRotationSpeed: (nodeId, speed) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      return {
        animations: {
          ...state.animations,
          [nodeId]: { ...existing, continuousRotation: { ...existing.continuousRotation, speed } },
        },
        hasUnsavedChanges: true,
      }
    }),

  setContinuousRotationDirection: (nodeId, direction) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      return {
        animations: {
          ...state.animations,
          [nodeId]: { ...existing, continuousRotation: { ...existing.continuousRotation, direction } },
        },
        hasUnsavedChanges: true,
      }
    }),

  setContinuousRotationActive: (nodeId, active) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      return {
        animations: {
          ...state.animations,
          [nodeId]: { ...existing, continuousRotation: { ...existing.continuousRotation, active } },
        },
        hasUnsavedChanges: true,
      }
    }),

  startPresentation: (nodeId, speed) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      const alreadyTurntable =
        existing.continuousRotation.active &&
        existing.continuousRotation.axes.y &&
        !existing.continuousRotation.axes.x &&
        !existing.continuousRotation.axes.z
      return {
        animations: {
          ...state.animations,
          [nodeId]: {
            ...existing,
            continuousRotation: alreadyTurntable
              ? { ...existing.continuousRotation, active: false }
              : { active: true, axes: { x: false, y: true, z: false }, speed, direction: 1 },
          },
        },
        hasUnsavedChanges: true,
      }
    }),

  startTimedAnimation: (nodeId, config) =>
    set((state) => {
      const existing = state.animations[nodeId] ?? DEFAULT_NODE_ANIMATION
      const runId = state.timedRunCounter + 1
      return {
        timedRunCounter: runId,
        animations: {
          ...state.animations,
          [nodeId]: { ...existing, timed: { ...config, active: true, runId } },
        },
        hasUnsavedChanges: true,
      }
    }),

  markTimedAnimationFinished: (nodeId) =>
    set((state) => {
      if (!state.animations[nodeId]?.timed) return {}
      return { animations: { ...state.animations, [nodeId]: { ...state.animations[nodeId], timed: null } } }
    }),

  setAnimationsPaused: (animationsPaused) => set({ animationsPaused }),
  setExplodeFactor: (explodeFactor) => set({ explodeFactor, hasUnsavedChanges: true }),

  requestNodeReset: (nodeId) =>
    set((state) => {
      const nextAnimations = { ...state.animations }
      delete nextAnimations[nodeId]
      return {
        animations: nextAnimations,
        resetSignal: { nodeId, all: false, requestId: (state.resetSignal?.requestId ?? 0) + 1 },
        hasUnsavedChanges: true,
      }
    }),

  requestResetAll: () =>
    set((state) => ({
      animations: {},
      explodeFactor: 0,
      resetSignal: { nodeId: null, all: true, requestId: (state.resetSignal?.requestId ?? 0) + 1 },
      hasUnsavedChanges: true,
    })),

  registerInitialTransform: (nodeId, position, rotation) =>
    set((state) => {
      if (state.initialTransforms[nodeId]) return {}
      return {
        initialTransforms: {
          ...state.initialTransforms,
          [nodeId]: { position: position.clone(), rotation: rotation.clone() },
        },
      }
    }),

  // Auto-dimensioning nudges every part semi-transparent so interior cotes
  // (a bore's diameter, an inner shoulder) stay visible - snapshotting the
  // real per-node opacity first and restoring it exactly on toggle-off,
  // rather than just resetting everything to fully opaque, so it never
  // clobbers whatever transparency the user had already set up themselves.
  toggleAutoDimensions: () => {
    const { showAutoDimensions, opacity, tree, edgeData, fileName, dimensionTargetNodeId, dimensionsOpacitySnapshot } =
      get()
    if (!tree) return

    if (showAutoDimensions) {
      const snapshot = dimensionsOpacitySnapshot ?? {}
      for (const leafId of collectPartNodeIds(tree)) {
        const node = findNodeById(tree, leafId)
        if (node) applyOpacity(node, snapshot[leafId] ?? 1)
      }
      set({
        showAutoDimensions: false,
        opacity: { ...opacity, ...snapshot },
        dimensionsOpacitySnapshot: null,
        dimensionReport: null,
      })
      return
    }

    const targetNode = dimensionTargetNodeId ? findNodeById(tree, dimensionTargetNodeId) : tree
    const report = targetNode ? buildDimensionReport(targetNode, edgeData, fileName ?? 'model') : null

    for (const leafId of collectPartNodeIds(tree)) {
      const node = findNodeById(tree, leafId)
      if (node) applyOpacity(node, AUTO_DIMENSION_OPACITY)
    }
    const nextOpacity: Record<string, number> = {}
    for (const id of collectNodeIds(tree)) nextOpacity[id] = AUTO_DIMENSION_OPACITY

    set({
      showAutoDimensions: true,
      dimensionsOpacitySnapshot: { ...opacity },
      opacity: nextOpacity,
      dimensionReport: report,
    })
  },

  setDimensionTargetNodeId: (dimensionTargetNodeId) => {
    const { tree, edgeData, fileName, showAutoDimensions } = get()
    if (!tree) {
      set({ dimensionTargetNodeId })
      return
    }
    const targetNode = dimensionTargetNodeId ? findNodeById(tree, dimensionTargetNodeId) : tree
    const report = showAutoDimensions && targetNode ? buildDimensionReport(targetNode, edgeData, fileName ?? 'model') : null
    set({ dimensionTargetNodeId, dimensionReport: report })
  },

  setSourceFileHash: (sourceFileHash) => set({ sourceFileHash }),
  setProjectName: (projectName) => set({ projectName }),

  toggleAnnotationMode: () =>
    set((state) => ({
      annotationMode: !state.annotationMode,
      pendingAnnotation: null,
      measureMode: false,
      measurePendingPoint: null,
      measurePendingSnap: null,
      pipetteMode: false,
      pickedColor: null,
      boxSelectMode: false,
      flowPickMode: false,
    })),

  exitAnnotationMode: () => set({ annotationMode: false, pendingAnnotation: null }),
  setPendingAnnotation: (pendingAnnotation) => set({ pendingAnnotation }),

  toggleFlowPickMode: () =>
    set((state) => {
      const turningOn = !state.flowPickMode
      return {
        flowPickMode: turningOn,
        flowEditPointIndex: null,
        pipetteMode: false,
        pickedColor: null,
        measureMode: false,
        measurePendingPoint: null,
        measurePendingSnap: null,
        annotationMode: false,
        pendingAnnotation: null,
        boxSelectMode: false,
        // Detected fresh every time the tool is (re)opened, not just once
        // at load, so passages found by parts hidden/loaded since the last
        // time aren't missed.
        flowPassageCandidates: turningOn ? findFlowPassages(state.edgeData) : state.flowPassageCandidates,
        flowPassageIndex: 0,
      }
    }),
  exitFlowPickMode: () => set({ flowPickMode: false, flowEditPointIndex: null }),

  addFlowPathPoint: (point) => set((state) => ({ flowPath: [...state.flowPath, point.clone()] })),
  // Precise alternative to clicking on the mesh: moves `distance` mm from
  // the last placed point (world origin if the path is still empty) along
  // `axis`, then tilts that direction by `angleDeg` around a fixed
  // perpendicular axis (Y→Z tilts around X, Z→X around Y, X→Y around Z) -
  // 0° stays purely axis-aligned, useful when a click can't quite land on
  // the exact spot the fluid actually goes through.
  addFlowPathPointRelative: (axis, distance, angleDeg) =>
    set((state) => {
      const base = state.flowPath.length > 0 ? state.flowPath[state.flowPath.length - 1].clone() : new THREE.Vector3()
      const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      const tiltAxis = axis === 'x' ? new THREE.Vector3(0, 1, 0) : axis === 'y' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
      direction.applyAxisAngle(tiltAxis, THREE.MathUtils.degToRad(angleDeg))
      return { flowPath: [...state.flowPath, base.addScaledVector(direction, distance)] }
    }),
  selectFlowPathPoint: (index) =>
    set((state) => ({ flowEditPointIndex: state.flowEditPointIndex === index ? null : index })),
  moveFlowPathPoint: (index, point) =>
    set((state) => {
      if (index < 0 || index >= state.flowPath.length) return {}
      const nextPath = [...state.flowPath]
      nextPath[index] = point.clone()
      return { flowPath: nextPath, flowEditPointIndex: null }
    }),
  reverseFlowPath: () => set((state) => ({ flowPath: [...state.flowPath].reverse(), flowEditPointIndex: null })),
  undoFlowPathPoint: () => set((state) => ({ flowPath: state.flowPath.slice(0, -1), flowEditPointIndex: null })),
  clearFlowPath: () => {
    if (get().flowPlaying) get().setFlowPlaying(false)
    set({ flowPath: [], flowEditPointIndex: null })
  },

  // Ties the "see the water move" toggle to the same semi-transparency
  // trick toggleAutoDimensions uses: snapshot each part's real opacity
  // first and restore it exactly on stop, rather than just forcing
  // everything back to fully opaque, so it never clobbers transparency the
  // user had already set up themselves.
  setFlowPlaying: (playing) => {
    const { tree, opacity, flowOpacitySnapshot } = get()
    if (!tree) {
      set({ flowPlaying: playing })
      return
    }

    if (!playing) {
      const snapshot = flowOpacitySnapshot ?? {}
      for (const leafId of collectPartNodeIds(tree)) {
        const node = findNodeById(tree, leafId)
        if (node) applyOpacity(node, snapshot[leafId] ?? 1)
      }
      set({ flowPlaying: false, opacity: { ...opacity, ...snapshot }, flowOpacitySnapshot: null })
      return
    }

    for (const leafId of collectPartNodeIds(tree)) {
      const node = findNodeById(tree, leafId)
      if (node) applyOpacity(node, FLOW_OPACITY)
    }
    const nextOpacity: Record<string, number> = {}
    for (const id of collectNodeIds(tree)) nextOpacity[id] = FLOW_OPACITY

    set({ flowPlaying: true, flowOpacitySnapshot: { ...opacity }, opacity: nextOpacity })
  },
  setFlowSpeed: (flowSpeed) => set({ flowSpeed }),
  setFlowFluidType: (flowFluidType) => set({ flowFluidType }),
  setFlowTrajectoryShape: (flowTrajectoryShape) => set({ flowTrajectoryShape }),
  setFlowCircularAxis: (flowCircularAxis) => set({ flowCircularAxis }),
  setFlowCircularTurns: (flowCircularTurns) => set({ flowCircularTurns }),

  nextFlowPassage: () =>
    set((state) => ({
      flowPassageIndex:
        state.flowPassageCandidates.length > 0 ? (state.flowPassageIndex + 1) % state.flowPassageCandidates.length : 0,
    })),

  // Adopts a detected passage's two real rim centers as the whole flow
  // path in one click, converting from the mesh's own local space (where
  // findFlowPassages found them) to world space via that mesh's current
  // transform.
  useFlowPassage: (reversed) => {
    const { tree, flowPassageCandidates, flowPassageIndex } = get()
    const passage = flowPassageCandidates[flowPassageIndex]
    if (!tree || !passage) return
    const node = findNodeById(tree, passage.nodeId)
    if (!node?.mesh) return
    const entryWorld = node.mesh.localToWorld(passage.entry.clone())
    const exitWorld = node.mesh.localToWorld(passage.exit.clone())
    set({ flowPath: reversed ? [exitWorld, entryWorld] : [entryWorld, exitWorld], flowEditPointIndex: null })
  },

  dismissFlowPassages: () => set({ flowPassageCandidates: [], flowPassageIndex: 0 }),

  addAnnotation: (text) =>
    set((state) => {
      if (!state.pendingAnnotation || !text.trim()) return { pendingAnnotation: null }
      const annotation: Annotation = { id: crypto.randomUUID(), text: text.trim(), position: state.pendingAnnotation.point }
      return { annotations: [...state.annotations, annotation], pendingAnnotation: null, hasUnsavedChanges: true }
    }),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      hasUnsavedChanges: true,
    })),

  setCaptureFourViews: (captureFourViews) => set({ captureFourViews }),
  setGetCameraState: (getCameraState) => set({ getCameraState }),
  setApplyCameraState: (applyCameraState) => set({ applyCameraState }),
  setCapturePng: (capturePng) => set({ capturePng }),

  // Applies every setting from a loaded .pindi project onto the currently
  // loaded geometry (which the caller - useFileLoader.ts - has already
  // made sure is the right source file, by hash, before calling this).
  applyProjectFile: (project) => {
    const state = get()
    if (!state.tree) return

    for (const [nodeId, color] of Object.entries(project.colors)) {
      const node = findNodeById(state.tree, nodeId)
      if (node) applyColor(node, color, state.colorMode, state.theme)
    }
    for (const [nodeId, visible] of Object.entries(project.visibility)) {
      const node = findNodeById(state.tree, nodeId)
      if (node) applyVisibility(node, visible)
    }
    for (const [nodeId, value] of Object.entries(project.opacity)) {
      const node = findNodeById(state.tree, nodeId)
      if (node) applyOpacity(node, value)
    }

    const measurements = project.measurements.map((m, i) => deserializeMeasurement(`loaded-${i}`, m))
    const annotations = project.annotations.map(deserializeAnnotation)

    set({
      customColors: { ...project.colors },
      visibility: { ...state.visibility, ...project.visibility },
      opacity: { ...state.opacity, ...project.opacity },
      displayMode: project.displayMode,
      measurements,
      annotations,
      clippingEnabled: project.clippingPlane.active,
      clippingAxis: project.clippingPlane.axis,
      clippingPosition: project.clippingPlane.position,
      projectName: project.projectName,
      hasUnsavedChanges: false,
    })

    state.applyCameraState?.(project.camera)
  },

  toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
  setShowHelp: (showHelp) => set({ showHelp }),

  // Re-applies the color mode on top of the new theme so every part still
  // showing its "auto" gray/finish (not a user-picked custom color)
  // immediately reflects the new theme's look - the same refresh
  // setColorMode already does when the mode itself changes. Also the only
  // theme setter now - dark/light/solidworks are 3 discrete choices
  // (Toolbar.tsx's grouped buttons), not a cycle, so there's no toggle.
  setTheme: (theme) => {
    const { tree, colorMode, customColors } = get()
    set({ theme })
    if (tree) applyColorModeToTree(tree, colorMode, customColors, theme)
  },

  setPindiSourcePrompt: (pindiSourcePrompt) => set({ pindiSourcePrompt }),
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  setShowCloseConfirm: (showCloseConfirm) => set({ showCloseConfirm }),

  toggleAiChat: () => set((state) => ({ aiChatOpen: !state.aiChatOpen })),
  clearAiChat: () => set({ aiChatMessages: [] }),

  // Parses the command locally (see aiAssistant.ts - no network call) and
  // executes it against this same store's own actions, exactly as if the
  // user had clicked the corresponding buttons themselves.
  sendAiChatMessage: async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const pushMessage = (role: 'user' | 'assistant', messageText: string) =>
      set((state) => ({
        aiChatMessages: [...state.aiChatMessages, { id: crypto.randomUUID(), role, text: messageText }],
      }))

    pushMessage('user', trimmed)
    set((state) => ({
      aiChatInputHistory: [trimmed, ...state.aiChatInputHistory.filter((h) => h !== trimmed)].slice(0, 20),
    }))

    const { tree } = get()
    if (!tree) {
      pushMessage('assistant', "Charge d'abord un modèle avant de me donner des commandes.")
      return
    }

    // "étape par étape" is recognized in aiAssistant.ts but expanded HERE
    // against the live tree (needs to check which named parts really exist
    // in the loaded model) into a real select+translate step sequence.
    const plan: AiIntent[] = []
    for (const step of parseAiPlan(trimmed)) {
      if (step.kind === 'disassembleSequence') plan.push(...buildDisassembleSequence(tree, step.mode))
      else plan.push(step)
    }
    if (plan.length === 0) {
      pushMessage('assistant', "Aucune pièce de l'assemblage type (vis / flasque_haut / joint) n'a été trouvée pour ce démontage.")
      return
    }

    const withTarget = (target: AiTarget) => resolveAiTarget(tree, get().selectedNodeIds, target)

    // One step of the plan - unchanged from the single-command switch this
    // replaces, just callable per-step now. Every case still ends with a
    // bare `return` (fine here, this closure returns void).
    const runStep = (intent: AiIntent) => {
      switch (intent.kind) {
        case 'resetAll': {
        get().requestResetAll()
        pushMessage('assistant', 'Tout est réinitialisé : animations arrêtées, vue éclatée et positions remises à zéro.')
        return
      }
      case 'cameraView': {
        get().goToView?.(intent.view)
        pushMessage('assistant', 'Vue changée.')
        return
      }
      case 'flowPlay': {
        const { flowPath, flowPlaying } = get()
        if (flowPath.length < 2) {
          pushMessage(
            'assistant',
            "Aucun trajet de fluide n'est encore tracé - utilise d'abord le bouton « Flux d'eau » pour placer au moins 2 points sur la pièce.",
          )
          return
        }
        if (!flowPlaying) get().setFlowPlaying(true)
        pushMessage('assistant', "Écoulement du fluide lancé.")
        return
      }
      case 'flowStop': {
        if (!get().flowPlaying) {
          pushMessage('assistant', "Aucun écoulement n'est en cours.")
          return
        }
        get().setFlowPlaying(false)
        pushMessage('assistant', 'Écoulement arrêté.')
        return
      }
      case 'flowClear': {
        get().clearFlowPath()
        pushMessage('assistant', 'Parcours de fluide supprimé.')
        return
      }
      case 'flowSpeedChange': {
        if (get().flowPath.length < 2) {
          pushMessage('assistant', "Aucun parcours de fluide n'est encore tracé.")
          return
        }
        get().setFlowSpeed(intent.speed)
        pushMessage('assistant', "Vitesse de l'écoulement modifiée.")
        return
      }
      case 'flowPathTrace': {
        const { edgeData } = get()
        const { path, unresolved } = buildWaypointFlowPath(tree, edgeData, intent.waypoints)
        if (unresolved.length > 0) {
          pushMessage('assistant', `Pièce introuvable : ${unresolved.map((k) => `« ${k} »`).join(', ')}.`)
          return
        }
        if (path.length < 2) {
          pushMessage('assistant', "Le parcours décrit n'a pas assez de points (précise au moins une entrée et une sortie).")
          return
        }
        get().clearFlowPath()
        for (const point of path) get().addFlowPathPoint(point)
        get().setFlowFluidType(intent.fluid)
        get().setFlowSpeed(intent.speed)
        get().setFlowPlaying(true)
        pushMessage(
          'assistant',
          `Parcours de ${FLUID_TYPES[intent.fluid].label.toLowerCase()} tracé (${path.length} points) et écoulement lancé.`,
        )
        return
      }
      case 'flowPathAuto': {
        const { edgeData } = get()
        let path: THREE.Vector3[] | null = null
        let sourceLabel = ''
        if (!intent.keyword && canUseDefaultInjectionWaypoints(tree)) {
          const built = buildWaypointFlowPath(tree, edgeData, DEFAULT_INJECTION_WAYPOINTS)
          if (built.path.length >= 2) {
            path = built.path
            sourceLabel = 'parcours standard manchon → tube → arbre'
          }
        }
        if (!path) {
          const auto = findAutoFlowPath(tree, edgeData, intent.keyword)
          if (auto) {
            path = auto.path
            sourceLabel = `passage détecté sur « ${auto.nodeName} » (Ø${auto.diameter.toFixed(1)}mm)`
          }
        }
        if (!path) {
          pushMessage(
            'assistant',
            "Aucun passage traversant n'a été détecté automatiquement dans ce modèle. Utilise le bouton « Flux d'eau » pour tracer le parcours manuellement.",
          )
          return
        }
        get().clearFlowPath()
        for (const point of path) get().addFlowPathPoint(point)
        get().setFlowFluidType(intent.fluid)
        get().setFlowSpeed(intent.speed)
        get().setFlowPlaying(true)
        pushMessage(
          'assistant',
          `Parcours de ${FLUID_TYPES[intent.fluid].label.toLowerCase()} tracé automatiquement (${sourceLabel}) et écoulement lancé.`,
        )
        return
      }
      case 'select': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().setBoxSelection(ids, false)
        pushMessage('assistant', `Sélectionné : ${label}.`)
        return
      }
      case 'deselect': {
        get().clearSelection()
        pushMessage('assistant', 'Sélection effacée.')
        return
      }
      case 'presentation': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().startPresentation(encodeSelectionKey(ids), intent.speed)
        pushMessage('assistant', `Présentation (plateau tournant) démarrée pour ${label}.`)
        return
      }
      case 'explode': {
        get().setExplodeFactor(intent.factor)
        if (intent.target && intent.target !== 'all' && intent.target !== 'selected') {
          const { ids, label } = withTarget(intent.target)
          if (ids.length > 0) get().setBoxSelection(ids, false)
          pushMessage(
            'assistant',
            `L'éclatement s'applique à tout l'assemblage (à ${Math.round(intent.factor * 100)}%) - j'ai sélectionné ${label} pour que tu les repères.`,
          )
          return
        }
        pushMessage('assistant', `Vue éclatée réglée à ${Math.round(intent.factor * 100)}%.`)
        return
      }
      case 'opacity': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().setOpacityForSelection(intent.opacity, ids)
        pushMessage('assistant', `Opacité de ${label} réglée à ${Math.round(intent.opacity * 100)}%.`)
        return
      }
      case 'color': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().setColorForSelection(intent.color, ids)
        pushMessage('assistant', `Couleur de ${label} changée.`)
        return
      }
      case 'resetColor': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().resetColorForSelection(ids)
        pushMessage('assistant', `Couleur de ${label} réinitialisée.`)
        return
      }
      case 'resetAllColors': {
        get().resetAllColors()
        pushMessage('assistant', 'Toutes les couleurs ont été réinitialisées.')
        return
      }
      case 'pipetteColor': {
        const sourceMatch = withTarget({ keyword: intent.source })
        const sourceId = sourceMatch.ids[0]
        if (!sourceId) {
          pushMessage('assistant', `Aucune pièce ne correspond à « ${intent.source} » pour copier sa couleur.`)
          return
        }
        const sourceColor = get().customColors[sourceId]
        if (!sourceColor) {
          pushMessage(
            'assistant',
            `« ${intent.source} » n'a pas de couleur personnalisée à copier - applique-lui d'abord une couleur.`,
          )
          return
        }
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().setColorForSelection(sourceColor, ids)
        pushMessage('assistant', `Couleur de « ${intent.source} » copiée sur ${label}.`)
        return
      }
      case 'visibility': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().setVisibilityForSelection(intent.visible, ids)
        pushMessage('assistant', `${intent.visible ? 'Affiché' : 'Masqué'} : ${label}.`)
        return
      }
      case 'rotateContinuous': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        const key = encodeSelectionKey(ids)
        get().setContinuousRotationAxis(key, intent.axis, true)
        get().setContinuousRotationSpeed(key, intent.speed)
        get().setContinuousRotationDirection(key, intent.direction)
        get().setContinuousRotationActive(key, true)
        pushMessage('assistant', `Rotation continue lancée sur l'axe ${intent.axis.toUpperCase()} pour ${label}.`)
        return
      }
      case 'rotateAngle': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().startTimedAnimation(encodeSelectionKey(ids), {
          kind: 'rotation',
          axis: intent.axis,
          mode: 'once',
          targetValue: intent.angle,
          duration: intent.duration,
        })
        pushMessage('assistant', `Rotation de ${intent.angle}° lancée pour ${label}.`)
        return
      }
      case 'translate': {
        const { ids, label } = withTarget(intent.target)
        if (ids.length === 0) {
          pushMessage('assistant', `Aucune pièce ne correspond à ${label}.`)
          return
        }
        get().startTimedAnimation(encodeSelectionKey(ids), {
          kind: 'translation',
          axis: intent.axis,
          mode: 'once',
          targetValue: intent.distance,
          duration: intent.duration,
        })
        pushMessage('assistant', `Translation de ${intent.distance}mm lancée pour ${label}.`)
        return
      }
      case 'unknown':
      default:
        pushMessage(
          'assistant',
          "Je n'ai pas compris. Essaie par exemple : « Éclate toutes les pièces », « Fais tourner l'arbre sur lui-même », « Monte les flasques de 50mm », « Rends le tube transparent », « Met la flasque_haut en rouge », « Même couleur que le tube », « Trace le parcours de l'eau dans l'assemblage », « L'eau entre par le manchon, traverse le tube et sort par l'arbre », ou « Arrête tout et remets en position initiale ».",
        )
    }
    }

    // How long to wait before running the NEXT step - lets a "démonte
    // étape par étape"/combo plan visibly move one part at a time instead
    // of firing every animation at once; a plain one-step command (the
    // vast majority) never waits at all.
    const stepWaitMs = (intent: AiIntent): number => {
      if (intent.kind === 'translate' || intent.kind === 'rotateAngle') return intent.duration * 1000
      if (intent.kind === 'select') return 300
      return 0
    }

    const token = ++aiSequenceToken
    const multiStep = plan.length > 1
    if (multiStep) set({ aiSequenceActive: true, aiSequenceProgress: { step: 0, total: plan.length } })

    for (let i = 0; i < plan.length; i++) {
      if (aiSequenceToken !== token) break // cancelled via stopAiSequence() or a newer command
      if (multiStep) set({ aiSequenceProgress: { step: i + 1, total: plan.length } })
      runStep(plan[i])
      const waitMs = stepWaitMs(plan[i])
      if (waitMs > 0 && i < plan.length - 1) await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    if (multiStep && aiSequenceToken === token) set({ aiSequenceActive: false, aiSequenceProgress: null })
  },

  stopAiSequence: () => {
    aiSequenceToken++
    set({ aiSequenceActive: false, aiSequenceProgress: null })
  },
}))
