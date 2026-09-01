import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { X } from 'lucide-react'
import { Environment, GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import { EffectComposer, Outline } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useModelStore } from '../hooks/useModelState'
import { useDevice } from '../hooks/useDevice'
import { fitCameraToObject } from '../utils/cameraFit'
import { applyDisplayMode } from '../utils/displayMode'
import { VIEW_DEFINITIONS, getViewDistance } from '../utils/cameraViews'
import { animateCameraTo } from '../utils/animateCamera'
import { collectMeshes, collectPartNodeIds, findNodeById, getPrimaryMaterial } from '../utils/componentTree'
import { activeClippingPlanes } from '../utils/clippingPlanes'
import { hideAllSectionCaps, isClipCapMesh, updateAllSectionCaps } from '../utils/clippingCap'
import {
  applyContinuousRotation,
  applyExplode,
  applyTimed,
  getOrCreatePivot,
  resetPivot,
  type PivotEntry,
  type TimedRuntime,
} from '../utils/animationPivot'
import { findFlowCircle, findSnap, resolveDistanceMeasurement, type PointerKind, type SnapResult } from '../utils/snapping'
import { MeasurementsGroup } from './MeasurementsGroup'
import { SnapIndicator } from './SnapIndicator'
import { AutoDimensions } from './AutoDimensions'
import { Annotations } from './Annotations'
import { THEME_COLORS, getSolidworksBackgroundTexture } from '../utils/themeColors'
import { FLUID_TYPES, type FlowFluidType } from '../utils/fluidTypes'
import {
  circleTrajectoryPointAt,
  circleTrajectoryTangentAt,
  computeCircleTrajectory,
  type FlowAxis,
  type FlowTrajectoryShape,
} from '../utils/flowTrajectory'
import type { CameraState, ComponentNode, ViewPreset } from '../types/model'

const MEASURE_MARKER_COLOR = '#ef4444'
const MEASURE_LINE_COLOR = '#fde047'
// Re-running findSnap() on every mousemove is wasted work once the cursor is
// sitting still over a curved surface between real cursor movements; capping
// how often it re-resolves keeps hover responsive without recomputing on
// every single event.
const HOVER_SNAP_THROTTLE_MS = 30

function MeasurePreview({
  start,
  markerRadius,
  lineRef,
}: {
  start: THREE.Vector3
  markerRadius: number
  lineRef: RefObject<THREE.Line | null>
}) {
  // Built imperatively via <primitive> rather than the JSX <line> intrinsic,
  // which TypeScript resolves to the SVG element (not r3f's THREE.Line) and
  // rejects a THREE.Line ref.
  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([start.x, start.y, start.z, start.x, start.y, start.z]), 3),
    )
    const material = new THREE.LineDashedMaterial({
      color: MEASURE_LINE_COLOR,
      dashSize: markerRadius * 2,
      gapSize: markerRadius,
    })
    return new THREE.Line(geometry, material)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  return (
    <>
      <mesh position={start}>
        <sphereGeometry args={[markerRadius, 16, 16]} />
        <meshBasicMaterial color={MEASURE_MARKER_COLOR} />
      </mesh>
      <primitive object={lineObject} ref={lineRef} />
    </>
  )
}

const FLOW_EDIT_POINT_COLOR = '#f97316'
const FLOW_PARTICLE_COUNT = 16

// The placed points and the line connecting them - shown throughout
// picking so the user can see the trajectory they're building, and left
// visible afterward as a faint guide for where the animated droplets
// actually flow. While in pick mode, each marker is itself clickable: a
// click arms that point for repositioning (see handlePointerDown's
// flowPickMode branch) - stopPropagation keeps that same click from also
// being read as "place a new point" by the model underneath it.
function FlowPathPreview({
  path,
  markerRadius,
  editIndex,
  onSelectPoint,
  color,
}: {
  path: THREE.Vector3[]
  markerRadius: number
  editIndex: number | null
  onSelectPoint?: (index: number) => void
  color: string
}) {
  const lineObject = useMemo(() => {
    if (path.length < 2) return null
    const geometry = new THREE.BufferGeometry().setFromPoints(path)
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
    return new THREE.Line(geometry, material)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, color])

  return (
    <>
      {path.map((point, i) => {
        const selected = i === editIndex
        return (
          <mesh
            key={i}
            position={point}
            onPointerDown={
              onSelectPoint
                ? (e) => {
                    e.stopPropagation()
                    onSelectPoint(i)
                  }
                : undefined
            }
          >
            <sphereGeometry args={[markerRadius * (selected ? 1.8 : 1.2), 12, 12]} />
            <meshBasicMaterial color={selected ? FLOW_EDIT_POINT_COLOR : color} transparent opacity={0.85} />
          </mesh>
        )
      })}
      {lineObject && <primitive object={lineObject} />}
    </>
  )
}

// A handful of markers continuously looping along the user-traced
// trajectory to illustrate which way the fluid actually moves through the
// assembly - positions are mutated imperatively every frame via refs
// rather than through React state, same as the rest of this file's
// per-frame animation (AnimationController below), so this doesn't
// re-render 60x/sec.
//
// Two trajectory shapes: "linear" follows a THREE.CatmullRomCurve3 through
// the picked points directly (a straight/curved passage); "circular"
// instead sweeps a circle/helix fitted through those same points (see
// flowTrajectory.ts), for a cylindrical chamber's swirl/vortex.
//
// A liquid (water/oil) reads best as small bubbles gently pulsing in size
// as they drift; a gas (air) reads best as arrows that visibly point the
// way it's flowing - THREE.ArrowHelper isn't a native r3f intrinsic, so
// (like MeasurePreview's THREE.Line above) it's built once imperatively
// and mounted via <primitive>, oriented every frame to the trajectory's
// own tangent at that arrow's current position.
function FlowAnimation({
  path,
  speed,
  markerRadius,
  fluidType,
  trajectoryShape,
  circularAxis,
  circularTurns,
}: {
  path: THREE.Vector3[]
  speed: number
  markerRadius: number
  fluidType: FlowFluidType
  trajectoryShape: FlowTrajectoryShape
  circularAxis: FlowAxis
  circularTurns: number
}) {
  const config = FLUID_TYPES[fluidType]
  const linearCurve = useMemo(
    () => (trajectoryShape === 'linear' ? new THREE.CatmullRomCurve3(path) : null),
    [path, trajectoryShape],
  )
  const circleParams = useMemo(
    () => (trajectoryShape === 'circular' ? computeCircleTrajectory(path, circularAxis) : null),
    [path, trajectoryShape, circularAxis],
  )
  const getPointAt = (t: number) =>
    linearCurve ? linearCurve.getPointAt(t) : circleTrajectoryPointAt(circleParams!, circularTurns, t)
  const getTangentAt = (t: number) =>
    linearCurve ? linearCurve.getTangentAt(t) : circleTrajectoryTangentAt(circleParams!, circularTurns, t)

  const groupRef = useRef<THREE.Group>(null)
  const progressRef = useRef(
    Array.from({ length: FLOW_PARTICLE_COUNT }, (_, i) => i / FLOW_PARTICLE_COUNT),
  )

  const arrows = useMemo(() => {
    if (config.shape !== 'arrow') return null
    return Array.from(
      { length: FLOW_PARTICLE_COUNT },
      () => new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), markerRadius * 6, config.color, markerRadius * 2.2, markerRadius * 1.4),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.shape, config.color, markerRadius])

  useFrame((state, delta) => {
    const progress = progressRef.current
    for (let i = 0; i < progress.length; i++) {
      progress[i] = (progress[i] + speed * delta) % 1
      const point = getPointAt(progress[i])
      if (arrows) {
        arrows[i].position.copy(point)
        arrows[i].setDirection(getTangentAt(progress[i]))
        continue
      }
      const mesh = groupRef.current?.children[i]
      if (!mesh) continue
      mesh.position.copy(point)
      // A gentle, per-particle-offset size oscillation so the bubbles
      // don't all pulse in lockstep - purely cosmetic, no bearing on the
      // actual flow direction/speed.
      mesh.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4 + i) * 0.15)
    }
  })

  if (arrows) {
    return (
      <>
        {arrows.map((arrow, i) => (
          <primitive key={i} object={arrow} />
        ))}
      </>
    )
  }

  return (
    <group ref={groupRef}>
      {progressRef.current.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[markerRadius * 1.8, 12, 12]} />
          <meshStandardMaterial color={config.color} transparent opacity={0.85} roughness={0.15} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}

// Every model material shares the `activeClippingPlanes` array reference (set
// once at creation - see displayMode.ts/colorPalette.ts), so clipping is
// local per-material rather than the renderer's global clippingPlanes list.
// That's what lets the measurement overlay opt out entirely: it just never
// points its own materials at this array.
//
// The cut itself is filled with a solid face built to exactly match the
// real cross-section (see clippingCap.ts/sectionCap.ts): every triangle the
// plane actually crosses contributes the segment of true cut contour it
// covers, and those segments are chained into loops and triangulated,
// SEPARATELY PER PART - each mesh in the assembly gets its own cap, tinted
// from its own color, rather than one merged cap for the whole scene (an
// inner part's loop could otherwise be misclassified as a hole of an outer
// part's loop, leaving both uncapped). Two earlier whole-assembly
// approaches were tried and dropped: a BackSide clone per mesh only reads
// correctly on convex, single-shell geometry (concave features and
// multi-shell parts showed through as hollow), and a stencil-buffer
// technique (2 mask passes per mesh + one oversized global cap plane gated
// by a stencil test) depends on the source mesh being a perfectly
// watertight 2-manifold to stay confined to the part's silhouette - CAD
// tessellation isn't reliably that clean, so the plane would occasionally
// show through past the part's outline.
function ClippingController() {
  const object = useModelStore((s) => s.object)
  const enabled = useModelStore((s) => s.clippingEnabled)
  const axis = useModelStore((s) => s.clippingAxis)
  const position = useModelStore((s) => s.clippingPosition)

  useEffect(() => {
    activeClippingPlanes.length = 0
    if (enabled) {
      activeClippingPlanes.push(
        new THREE.Plane(
          new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
          -position,
        ),
      )
    }
  }, [enabled, axis, position])

  useEffect(() => () => {
    activeClippingPlanes.length = 0
  }, [])

  // Each part's cap is attached directly to that part's own mesh (like the
  // edges/wireframe overlays elsewhere) rather than tracked through a React
  // hook, since it's mutated imperatively on every clip-state change.
  useEffect(() => {
    if (!object) return
    if (!enabled) {
      hideAllSectionCaps(object)
      return
    }
    const plane = activeClippingPlanes[0]
    if (!plane) return
    updateAllSectionCaps(object, plane)
  }, [object, enabled, axis, position])

  return null
}

// Drives every active part animation (continuous spin, timed rotation/
// translation, the exploded-view slider) each frame. Pivots are created
// lazily (see animationPivot.ts) and tracked only in this component's own
// refs - the zustand `animations`/`explodeFactor` fields are just the
// declarative intent the animation panel edits; this is what turns that
// intent into actual per-frame THREE.js transforms, kept out of React
// state so it doesn't re-render anything 60x/sec (the same split already
// used for the measure tool's hover/preview state elsewhere in this file).
function AnimationController() {
  const object = useModelStore((s) => s.object)
  const tree = useModelStore((s) => s.tree)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const animations = useModelStore((s) => s.animations)
  const animationsPaused = useModelStore((s) => s.animationsPaused)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const resetSignal = useModelStore((s) => s.resetSignal)
  const markTimedAnimationFinished = useModelStore((s) => s.markTimedAnimationFinished)
  const registerInitialTransform = useModelStore((s) => s.registerInitialTransform)

  const pivotRegistry = useRef(new Map<string, PivotEntry>())
  const timedRuntime = useRef(new Map<string, TimedRuntime>())
  const registeredInitial = useRef(new Set<string>())
  const explodeAppliedRef = useRef(0)
  const lastResetRequestId = useRef(0)

  const partNodeIds = useMemo(() => (tree ? collectPartNodeIds(tree) : []), [tree])
  const assemblyCenter = useMemo(
    () => (boundingBox ? boundingBox.getCenter(new THREE.Vector3()) : null),
    [boundingBox],
  )

  useEffect(() => {
    pivotRegistry.current.clear()
    timedRuntime.current.clear()
    registeredInitial.current.clear()
    explodeAppliedRef.current = 0
  }, [object])

  // A one-shot "physically reset this pivot (or all of them)" instruction
  // from the panel's Reset buttons - watched here rather than called
  // imperatively from the panel since the pivot registry only exists
  // inside this component, on the Canvas side.
  useEffect(() => {
    if (!resetSignal || resetSignal.requestId === lastResetRequestId.current) return
    lastResetRequestId.current = resetSignal.requestId
    if (resetSignal.all) {
      for (const entry of pivotRegistry.current.values()) resetPivot(entry)
      explodeAppliedRef.current = 0
    } else if (resetSignal.nodeId) {
      const entry = pivotRegistry.current.get(resetSignal.nodeId)
      if (entry) resetPivot(entry)
    }
  }, [resetSignal])

  useFrame((_, delta) => {
    if (!object || !tree) return

    if (!animationsPaused) {
      for (const nodeId of Object.keys(animations)) {
        const anim = animations[nodeId]
        if (!anim.continuousRotation.active && !anim.timed) continue

        const entry = getOrCreatePivot(pivotRegistry.current, object, tree, nodeId)
        if (!entry) continue

        if (!registeredInitial.current.has(nodeId)) {
          registeredInitial.current.add(nodeId)
          registerInitialTransform(nodeId, entry.center, entry.pivot.rotation)
        }

        if (anim.continuousRotation.active) applyContinuousRotation(entry, anim.continuousRotation, delta)
        if (anim.timed) applyTimed(entry, anim.timed, timedRuntime.current, nodeId, delta, markTimedAnimationFinished)
      }
    }

    if ((explodeFactor !== 0 || explodeAppliedRef.current !== 0) && assemblyCenter && partNodeIds.length > 0) {
      const damping = 1 - Math.exp(-delta * 6)
      explodeAppliedRef.current = THREE.MathUtils.lerp(explodeAppliedRef.current, explodeFactor, damping)
      if (Math.abs(explodeAppliedRef.current - explodeFactor) < 0.0005) {
        explodeAppliedRef.current = explodeFactor
      }
      applyExplode(pivotRegistry.current, object, tree, partNodeIds, assemblyCenter, explodeAppliedRef.current)
    }
  })

  return null
}

function Scene() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null)
  const { camera, gl, scene, size } = useThree()
  const object = useModelStore((s) => s.object)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const tree = useModelStore((s) => s.tree)
  const displayMode = useModelStore((s) => s.displayMode)
  const theme = useModelStore((s) => s.theme)
  const showGrid = useModelStore((s) => s.showGrid)
  const setResetView = useModelStore((s) => s.setResetView)
  const setGoToView = useModelStore((s) => s.setGoToView)
  const openContextMenu = useModelStore((s) => s.openContextMenu)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const selectNode = useModelStore((s) => s.selectNode)
  const toggleNodeSelection = useModelStore((s) => s.toggleNodeSelection)
  const selectRange = useModelStore((s) => s.selectRange)
  const boxSelectMode = useModelStore((s) => s.boxSelectMode)
  const setGetPartScreenPositions = useModelStore((s) => s.setGetPartScreenPositions)
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const pickedColor = useModelStore((s) => s.pickedColor)
  const setPickedColor = useModelStore((s) => s.setPickedColor)
  const exitPipetteMode = useModelStore((s) => s.exitPipetteMode)
  const setNodeColor = useModelStore((s) => s.setNodeColor)
  const setColorForSelection = useModelStore((s) => s.setColorForSelection)
  const measureMode = useModelStore((s) => s.measureMode)
  const addMeasurement = useModelStore((s) => s.addMeasurement)
  const pendingPoint = useModelStore((s) => s.measurePendingPoint)
  const setPendingPoint = useModelStore((s) => s.setMeasurePendingPoint)
  const pendingSnap = useModelStore((s) => s.measurePendingSnap)
  const setPendingSnap = useModelStore((s) => s.setMeasurePendingSnap)
  const edgeData = useModelStore((s) => s.edgeData)
  const annotationMode = useModelStore((s) => s.annotationMode)
  const setPendingAnnotation = useModelStore((s) => s.setPendingAnnotation)
  const flowPickMode = useModelStore((s) => s.flowPickMode)
  const addFlowPathPoint = useModelStore((s) => s.addFlowPathPoint)
  const flowPath = useModelStore((s) => s.flowPath)
  const flowEditPointIndex = useModelStore((s) => s.flowEditPointIndex)
  const selectFlowPathPoint = useModelStore((s) => s.selectFlowPathPoint)
  const moveFlowPathPoint = useModelStore((s) => s.moveFlowPathPoint)
  const flowPlaying = useModelStore((s) => s.flowPlaying)
  const flowSpeed = useModelStore((s) => s.flowSpeed)
  const flowFluidType = useModelStore((s) => s.flowFluidType)
  const flowTrajectoryShape = useModelStore((s) => s.flowTrajectoryShape)
  const flowCircularAxis = useModelStore((s) => s.flowCircularAxis)
  const flowCircularTurns = useModelStore((s) => s.flowCircularTurns)
  const setCaptureFourViews = useModelStore((s) => s.setCaptureFourViews)
  const setGetCameraState = useModelStore((s) => s.setGetCameraState)
  const setApplyCameraState = useModelStore((s) => s.setApplyCameraState)
  const setCapturePng = useModelStore((s) => s.setCapturePng)
  const [hoverSnap, setHoverSnap] = useState<SnapResult | null>(null)
  const rightClickStart = useRef<{ x: number; y: number } | null>(null)
  const leftClickStart = useRef<{ x: number; y: number } | null>(null)
  const previewLineRef = useRef<THREE.Line | null>(null)
  const lastSnapCheckRef = useRef(0)
  const latestSnapRef = useRef<SnapResult | null>(null)

  const { isTouch } = useDevice()
  const setMeasureTouchScreenPos = useModelStore((s) => s.setMeasureTouchScreenPos)

  const markerRadius = useMemo(() => {
    if (!boundingBox) return 1
    const sphereRadius = boundingBox.getBoundingSphere(new THREE.Sphere()).radius
    const base = Math.max(sphereRadius * 0.01, 1e-3)
    // Matches the touch marker being visually ~2.5x a mouse one (4px vs
    // 10px) requested for mobile - a fingertip needs a much bigger target
    // to read clearly than a mouse cursor does.
    return isTouch ? base * 2.5 : base
  }, [boundingBox, isTouch])

  useEffect(() => {
    if (!object || !controlsRef.current) return

    const perspectiveCamera = camera as THREE.PerspectiveCamera
    fitCameraToObject(perspectiveCamera, controlsRef.current, object)

    const initialPosition = camera.position.clone()
    const initialTarget = controlsRef.current.target.clone()

    setResetView(() => {
      camera.position.copy(initialPosition)
      controlsRef.current?.target.copy(initialTarget)
      controlsRef.current?.update()
    })
  }, [object, camera, setResetView])

  // Imperative rather than the declarative <color attach="background">
  // this used to be: solidworks' backdrop is a vertical gradient texture
  // (see themeColors.ts), not a flat color, so a single mechanism has to
  // handle both cases here instead of splitting them across a JSX element
  // and a separate effect that would otherwise fight over the same
  // scene.background property.
  useEffect(() => {
    // oxlint's react(immutability) rule flags this (mutating a value
    // useThree() returned) - harmless here, since mutating `scene` directly
    // is the normal, idiomatic way to control it in r3f; there's no
    // immutable alternative for a THREE.Scene.
    scene.background =
      theme === 'solidworks' ? getSolidworksBackgroundTexture() : new THREE.Color(THEME_COLORS[theme].canvasBg)
  }, [theme, scene])

  useEffect(() => {
    if (!object) return
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && !isClipCapMesh(child)) {
        applyDisplayMode(child, displayMode, theme)
      }
    })
  }, [object, displayMode, theme])

  // Shadows are only meaningful in realistic mode - size the key light's
  // shadow frustum to the current model so it isn't tuned for one scale
  // (a small bracket vs. a whole assembly) and left wrong for another.
  useEffect(() => {
    const light = keyLightRef.current
    if (!light) return

    const isRealistic = displayMode === 'realistic'
    light.castShadow = isRealistic
    if (!isRealistic) return

    const radius = boundingBox ? boundingBox.getBoundingSphere(new THREE.Sphere()).radius : 5
    const extent = Math.max(radius * 1.5, 1)
    const cam = light.shadow.camera
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 0.1
    cam.far = extent * 6
    cam.updateProjectionMatrix()
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.0005
  }, [displayMode, boundingBox])

  useEffect(() => {
    const goToView = (preset: ViewPreset) => {
      const controls = controlsRef.current
      if (!controls) return

      const perspectiveCamera = camera as THREE.PerspectiveCamera
      const target = controls.target.clone()
      const { direction, up } = VIEW_DEFINITIONS[preset]
      const distance = object
        ? getViewDistance(perspectiveCamera, object)
        : camera.position.distanceTo(target) || 5

      const newPosition = target.clone().add(direction.clone().multiplyScalar(distance))
      perspectiveCamera.up.copy(up)
      animateCameraTo(perspectiveCamera, controls, newPosition, target, 300)
    }
    setGoToView(goToView)
  }, [object, camera, setGoToView])

  // Camera-state bridges for the project (.pindi) save/load flow - reading
  // and applying position/target/zoom from outside the Canvas, the same way
  // resetView/goToView already expose imperative camera control to the
  // toolbar above.
  useEffect(() => {
    const getCameraState = (): CameraState => {
      const controls = controlsRef.current
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      return {
        position: camera.position.toArray() as [number, number, number],
        target: (controls?.target ?? new THREE.Vector3()).toArray() as [number, number, number],
        zoom: perspectiveCamera.zoom,
      }
    }
    setGetCameraState(getCameraState)
  }, [camera, setGetCameraState])

  useEffect(() => {
    const applyCameraState = (state: CameraState) => {
      const controls = controlsRef.current
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      camera.position.set(...state.position)
      if (controls) {
        controls.target.set(...state.target)
        controls.update()
      }
      perspectiveCamera.zoom = state.zoom || 1
      perspectiveCamera.updateProjectionMatrix()
    }
    setApplyCameraState(applyCameraState)
  }, [camera, setApplyCameraState])

  // Jumps the camera to each of the 4 standard views in turn, capturing a
  // PNG after each (for the PDF export's view grid), then restores exactly
  // where the camera started - instant jumps rather than goToView's
  // animated tween, since there's no need for the in-between frames to ever
  // be visible.
  useEffect(() => {
    const captureFourViews = async (): Promise<Record<'iso' | 'front' | 'top' | 'right', string>> => {
      const controls = controlsRef.current
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      if (!controls || !object) throw new Error('Aucun modèle chargé.')

      const savedPosition = camera.position.clone()
      const savedTarget = controls.target.clone()
      const savedUp = perspectiveCamera.up.clone()
      const savedZoom = perspectiveCamera.zoom

      const presets: ('iso' | 'front' | 'top' | 'right')[] = ['iso', 'front', 'top', 'right']
      const captures: Partial<Record<'iso' | 'front' | 'top' | 'right', string>> = {}

      for (const preset of presets) {
        const { direction, up } = VIEW_DEFINITIONS[preset]
        const distance = getViewDistance(perspectiveCamera, object)
        const newPosition = savedTarget.clone().add(direction.clone().multiplyScalar(distance))
        perspectiveCamera.up.copy(up)
        camera.position.copy(newPosition)
        controls.target.copy(savedTarget)
        controls.update()
        // r3f's own render loop (frameloop="always") redraws the canvas
        // every animation frame from whatever the camera's current state
        // is - waiting two frames guarantees the pixels about to be read
        // actually reflect this camera move rather than the previous one.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        captures[preset] = gl.domElement.toDataURL('image/png')
      }

      camera.position.copy(savedPosition)
      controls.target.copy(savedTarget)
      perspectiveCamera.up.copy(savedUp)
      perspectiveCamera.zoom = savedZoom
      controls.update()
      perspectiveCamera.updateProjectionMatrix()

      return captures as Record<'iso' | 'front' | 'top' | 'right', string>
    }
    setCaptureFourViews(captureFourViews)
  }, [object, camera, gl, setCaptureFourViews])

  // A single high-resolution snapshot of whatever the view currently shows.
  // The transparent option needs the renderer to actually have an alpha
  // channel (see the Canvas's gl={{ alpha: true }} below) and the scene's
  // own opaque background swapped out just for this one render, restored
  // immediately after so the live (opaque) view is untouched.
  useEffect(() => {
    const capturePng = (transparent: boolean): string => {
      if (!transparent) return gl.domElement.toDataURL('image/png')

      const previousBackground = scene.background
      const previousClearColor = gl.getClearColor(new THREE.Color())
      const previousClearAlpha = gl.getClearAlpha()

      scene.background = null
      gl.setClearColor(0x000000, 0)
      gl.render(scene, camera)
      const dataUrl = gl.domElement.toDataURL('image/png')

      scene.background = previousBackground
      gl.setClearColor(previousClearColor, previousClearAlpha)
      gl.render(scene, camera)

      return dataUrl
    }
    setCapturePng(capturePng)
  }, [camera, gl, scene, setCapturePng])

  const gridConfig = useMemo(() => {
    if (!object || !boundingBox) {
      return { y: 0, size: 20, cell: 1, section: 5 }
    }
    const size = boundingBox.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    return {
      y: boundingBox.min.y,
      size: maxDim * 6,
      cell: maxDim / 10 || 1,
      section: (maxDim / 10 || 1) * 5,
    }
  }, [object, boundingBox])

  const selectedMeshes = useMemo(() => {
    if (selectedNodeIds.length === 0 || !tree) return []
    const nodes = selectedNodeIds.map((id) => findNodeById(tree, id)).filter((n): n is ComponentNode => n !== null)
    return Array.from(new Set(nodes.flatMap((node) => collectMeshes(node))))
  }, [selectedNodeIds, tree])

  // Feeds the box-select overlay (a plain DOM drag rectangle outside the
  // Canvas - see the wrapping div in Viewer3D() below): projects every part's
  // world-space bounding-box center to the same screen pixel space that
  // rectangle is measured in, so its release handler can test containment
  // without needing its own access to the camera/canvas size.
  useEffect(() => {
    const getPartScreenPositions = () => {
      if (!tree) return []
      const results: { id: string; x: number; y: number }[] = []
      const center = new THREE.Vector3()
      for (const id of collectPartNodeIds(tree)) {
        const node = findNodeById(tree, id)
        if (!node?.mesh || !node.mesh.visible) continue
        new THREE.Box3().setFromObject(node.mesh).getCenter(center)
        center.project(camera)
        results.push({ id, x: (center.x * 0.5 + 0.5) * size.width, y: (-center.y * 0.5 + 0.5) * size.height })
      }
      return results
    }
    setGetPartScreenPositions(getPartScreenPositions)
  }, [tree, camera, size, setGetPartScreenPositions])

  // OrbitControls uses the left button to rotate and the right button to
  // pan, so both a selection click and a context menu must only fire on a
  // stationary click, not after a drag.
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button === 2) {
      rightClickStart.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    } else if (e.nativeEvent.button === 0) {
      leftClickStart.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    }
  }

  // three.js raycasting ignores `.visible`, so skip past any hidden parts to
  // the nearest one the user can actually see.
  const findVisibleNodeId = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const hit = e.intersections.find((i) => i.object.visible && i.object.userData.nodeId)
    return hit?.object.userData.nodeId as string | undefined
  }

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.nativeEvent.preventDefault()
    const start = rightClickStart.current
    rightClickStart.current = null
    const dragDistance = start
      ? Math.hypot(e.nativeEvent.clientX - start.x, e.nativeEvent.clientY - start.y)
      : 0
    if (dragDistance > 5) return

    // A stationary right-click always exits pipette mode instead of opening
    // the regular context menu.
    if (pipetteMode) {
      exitPipetteMode()
      return
    }

    const nodeId = findVisibleNodeId(e)
    if (!nodeId) return
    openContextMenu({ nodeId, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
  }

  // Shared by hover and click: resolves the nearest snap-worthy feature
  // (vertex/midpoint/edge point/circle) for whichever mesh is under the
  // cursor, in screen space so the snap distance stays zoom-independent.
  const resolveSnap = (
    hit: ThreeEvent<PointerEvent>['intersections'][number],
    cursorX: number,
    cursorY: number,
    pointerKind: PointerKind,
  ): SnapResult | null => {
    const mesh = hit.object as THREE.Mesh
    const nodeId = mesh.userData.nodeId as string | undefined
    const data = nodeId ? edgeData.get(nodeId) : undefined
    if (!data) return null
    return findSnap(
      mesh,
      data,
      hit.point,
      hit.faceIndex ?? undefined,
      camera,
      cursorX,
      cursorY,
      size.width,
      size.height,
      pointerKind,
    )
  }

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.pointerType === 'touch') setMeasureTouchScreenPos(null)
    if (e.nativeEvent.button !== 0) return
    // Box-select drags are handled entirely by the DOM overlay outside the
    // Canvas (see Viewer3D() below) - its own pointer-up computes the whole
    // rectangle's selection, so the model's per-click select below must stay
    // out of its way.
    if (boxSelectMode) return
    const start = leftClickStart.current
    leftClickStart.current = null
    const dragDistance = start
      ? Math.hypot(e.nativeEvent.clientX - start.x, e.nativeEvent.clientY - start.y)
      : 0
    if (dragDistance > 5) return

    // r3f's raycaster hits every intersected object along the ray, not just
    // the nearest one, and dispatches this SAME handler (attached once, on
    // the model's root primitive below) once per intersection unless told
    // to stop - a curved surface backed by more geometry along the same ray
    // (the far wall of a bore, a part sitting behind another) is enough to
    // produce several intersections from one physical click. Without this,
    // every branch below ran once per intersection, each still reading the
    // same pre-click pendingPoint/pendingSnap closure - harmless where the
    // action just overwrites the same state (selection, the pipette), but
    // addMeasurement APPENDS, so it alone turned one click into a run of
    // identical measurements.
    e.stopPropagation()

    const nodeId = findVisibleNodeId(e)

    if (pipetteMode) {
      if (!nodeId || !tree) return
      const node = findNodeById(tree, nodeId)
      const material = node?.mesh ? getPrimaryMaterial(node.mesh) : undefined
      if (!material) return
      if (!pickedColor) {
        setPickedColor(`#${material.color.getHexString()}`)
      } else if (selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId)) {
        setColorForSelection(pickedColor)
      } else {
        setNodeColor(nodeId, pickedColor)
      }
      return
    }

    if (annotationMode) {
      const hit = e.intersections.find((i) => i.object.visible && i.object instanceof THREE.Mesh)
      if (!hit) return
      setPendingAnnotation({ point: hit.point.clone(), x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
      return
    }

    if (flowPickMode) {
      const hit = e.intersections.find((i) => i.object.visible && i.object instanceof THREE.Mesh)
      if (!hit) return
      // Clicking near a hole/boss rim (a manchon's opening, a bore) should
      // place the point at that circle's own geometric CENTER - the middle
      // of the opening, where the fluid actually passes through - rather
      // than wherever the raycast happened to hit the surrounding wall.
      // Uses a dedicated disk-priority snap (findFlowCircle), not the
      // generic vertex/edge-first findSnap() the Measure tool uses: a
      // curved wall's own dense tessellation means almost every click
      // lands within a few pixels of SOME mesh vertex, which would
      // otherwise always win and defeat the circle snap entirely.
      const mesh = hit.object as THREE.Mesh
      const nodeId = mesh.userData.nodeId as string | undefined
      const data = nodeId ? edgeData.get(nodeId) : undefined
      const circle = data ? findFlowCircle(mesh, data, hit.point) : null
      const point = circle ? circle.center : hit.point
      if (flowEditPointIndex !== null) {
        moveFlowPathPoint(flowEditPointIndex, point.clone())
      } else {
        addFlowPathPoint(point.clone())
      }
      return
    }

    if (measureMode) {
      const hit = e.intersections.find(
        (i) => i.object.visible && i.object instanceof THREE.Mesh && i.face,
      )
      if (!hit || !hit.face) return
      const pointerKind: PointerKind = e.nativeEvent.pointerType === 'touch' ? 'touch' : 'mouse'
      const snap = resolveSnap(hit, e.nativeEvent.offsetX, e.nativeEvent.offsetY, pointerKind)
      const point = (snap?.point ?? hit.point).clone()

      if (!pendingPoint) {
        // A circle/arc is meaningful on its own, so the first click on one
        // shows its diameter immediately - it also becomes the pending
        // entity in case the very next click is meant to relate it to
        // something else (line-to-circle, circle-to-circle).
        if (snap?.type === 'circle' && snap.circle) {
          addMeasurement({
            id: crypto.randomUUID(),
            type: 'diameter',
            point1: point,
            point2: null,
            distance: null,
            radius: snap.circle.radius,
            center: snap.circle.center,
            axis: snap.circle.normal,
            startAngle: snap.circle.startAngle,
            angularSpan: snap.circle.angularSpan,
            approx: false,
          })
        }
        setPendingPoint(point)
        setPendingSnap(snap)
        return
      }

      // Second click completes a relational measurement against the first:
      // two parallel edges measure their perpendicular separation, a line
      // and a circle measure center-to-line, two circles measure
      // center-to-center, and anything else falls back to the plain
      // point-to-point distance between what was actually clicked.
      const result = resolveDistanceMeasurement(pendingPoint, pendingSnap, point, snap)
      addMeasurement({
        id: crypto.randomUUID(),
        type: 'distance',
        point1: result.a,
        point2: result.b,
        distance: result.distance,
        radius: null,
        center: null,
        axis: null,
        startAngle: null,
        angularSpan: null,
        approx: false,
      })
      setPendingPoint(null)
      setPendingSnap(null)
      return
    }

    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
      if (nodeId) toggleNodeSelection(nodeId)
      return
    }
    if (e.nativeEvent.shiftKey) {
      if (nodeId) selectRange(nodeId)
      return
    }
    selectNode(nodeId ?? null)
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!measureMode) return
    const isTouchPointer = e.nativeEvent.pointerType === 'touch'
    // The fingertip covers the point it's touching, so a plain DOM overlay
    // (see Viewer3D() below) draws a crosshair offset above it instead -
    // needs the raw client coordinates, not canvas-relative ones, since
    // that overlay sits outside the Canvas.
    if (isTouchPointer) {
      setMeasureTouchScreenPos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
    }
    const hit = e.intersections.find((i) => i.object.visible && i.object instanceof THREE.Mesh)
    if (!hit) {
      setHoverSnap(null)
      latestSnapRef.current = null
      return
    }

    const now = performance.now()
    let snap = latestSnapRef.current
    if (now - lastSnapCheckRef.current >= HOVER_SNAP_THROTTLE_MS) {
      lastSnapCheckRef.current = now
      const pointerKind: PointerKind = isTouchPointer ? 'touch' : 'mouse'
      snap = resolveSnap(hit, e.nativeEvent.offsetX, e.nativeEvent.offsetY, pointerKind)
      latestSnapRef.current = snap
      setHoverSnap(snap)
    }

    if (!pendingPoint) return
    const line = previewLineRef.current
    if (!line) return
    const target = snap?.point ?? hit.point
    const positions = line.geometry.attributes.position as THREE.BufferAttribute
    positions.setXYZ(0, pendingPoint.x, pendingPoint.y, pendingPoint.z)
    positions.setXYZ(1, target.x, target.y, target.z)
    positions.needsUpdate = true
    line.geometry.computeBoundingSphere()
    line.computeLineDistances()
  }

  return (
    <>
      <ambientLight intensity={THEME_COLORS[theme].ambientIntensity} />
      <directionalLight
        ref={keyLightRef}
        position={THEME_COLORS[theme].keyLightPosition}
        intensity={THEME_COLORS[theme].keyLightIntensity}
      />
      <directionalLight position={THEME_COLORS[theme].fillLightPosition} intensity={THEME_COLORS[theme].fillLightIntensity} />
      {displayMode === 'realistic' && <Environment preset="warehouse" />}
      {object && (
        <primitive
          object={object}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerOut={() => {
            setHoverSnap(null)
            setMeasureTouchScreenPos(null)
          }}
          onContextMenu={handleContextMenu}
        />
      )}
      {measureMode && pendingPoint && (
        <MeasurePreview start={pendingPoint} markerRadius={markerRadius} lineRef={previewLineRef} />
      )}
      {measureMode && hoverSnap && <SnapIndicator snap={hoverSnap} markerRadius={markerRadius} isTouch={isTouch} />}
      <MeasurementsGroup markerRadius={markerRadius} isTouch={isTouch} />
      <AutoDimensions />
      <Annotations markerRadius={markerRadius} />
      {flowPath.length > 0 && (
        <FlowPathPreview
          path={flowPath}
          markerRadius={markerRadius}
          editIndex={flowPickMode ? flowEditPointIndex : null}
          onSelectPoint={flowPickMode ? selectFlowPathPoint : undefined}
          color={FLUID_TYPES[flowFluidType].color}
        />
      )}
      {flowPlaying && flowPath.length >= 2 && (
        <FlowAnimation
          path={flowPath}
          speed={flowSpeed}
          markerRadius={markerRadius}
          fluidType={flowFluidType}
          trajectoryShape={flowTrajectoryShape}
          circularAxis={flowCircularAxis}
          circularTurns={flowCircularTurns}
        />
      )}
      {showGrid && (
        <Grid
          position={[0, gridConfig.y, 0]}
          args={[gridConfig.size, gridConfig.size]}
          cellSize={gridConfig.cell}
          cellThickness={0.5}
          cellColor={THEME_COLORS[theme].gridCell}
          sectionSize={gridConfig.section}
          sectionThickness={1}
          sectionColor={THEME_COLORS[theme].gridSection}
          fadeDistance={gridConfig.size * 1.5}
          fadeStrength={1}
          infiniteGrid
        />
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        // Pipette/measure/annotation are click-to-place tools, not drag
        // tools - handlePointerUp below already tells a stationary click
        // (its action) apart from a drag (just orbiting) by distance, the
        // same way the context menu already does for right-click, so
        // rotation can stay on in these modes without it ever firing
        // spuriously. Box-select is the one mode that's genuinely
        // drag-based itself (the rectangle IS a left-drag), so rotation has
        // to stay off there - both gestures use the same mouse button and
        // can't be told apart from each other.
        enableRotate={!boxSelectMode}
        enablePan
        enableZoom
      />
      <GizmoHelper alignment="bottom-left" margin={[72, 72]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="black" />
      </GizmoHelper>
      <ClippingController />
      <AnimationController />
      {selectedMeshes.length > 0 && (
        <EffectComposer autoClear={false}>
          <Outline
            selection={selectedMeshes}
            visibleEdgeColor={0xff8c00}
            hiddenEdgeColor={0xff8c00}
            edgeStrength={3}
            blur
            xRay
          />
        </EffectComposer>
      )}
    </>
  )
}

interface DragRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const MIN_DRAG_PX = 4

export function Viewer3D() {
  const clearSelection = useModelStore((s) => s.clearSelection)
  const setBoxSelection = useModelStore((s) => s.setBoxSelection)
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const measureMode = useModelStore((s) => s.measureMode)
  const annotationMode = useModelStore((s) => s.annotationMode)
  const boxSelectMode = useModelStore((s) => s.boxSelectMode)
  const flowPickMode = useModelStore((s) => s.flowPickMode)
  const measureTouchScreenPos = useModelStore((s) => s.measureTouchScreenPos)
  const measurePendingPoint = useModelStore((s) => s.measurePendingPoint)
  const setMeasurePendingPoint = useModelStore((s) => s.setMeasurePendingPoint)
  const setMeasurePendingSnap = useModelStore((s) => s.setMeasurePendingSnap)
  const { isMobile, isTouch } = useDevice()
  const crosshair = pipetteMode || measureMode || annotationMode || boxSelectMode || flowPickMode

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)

  // Rubber-band multi-select (see the Toolbar's "Sélection rectangle"
  // button): a plain DOM overlay outside the R3F Canvas, since the
  // rectangle itself is pure 2D UI. It shares the canvas's own screen space
  // one-for-one (both are absolute inset-0 inside the same wrapper), so a
  // point measured here lines up directly with getPartScreenPositions'
  // output (registered by Scene(), see the useEffect above) without any
  // extra coordinate conversion. Handlers live on the WRAPPING div (an
  // ancestor of the canvas, not a layer on top of it) so pointer events
  // still reach OrbitControls/R3F underneath first and bubble up here after
  // - right-drag pan and wheel zoom keep working while this tool is active,
  // only the left-drag gesture is repurposed (via enableRotate={false}
  // above) for the rectangle instead of orbiting the camera.
  const pointFromEvent = (e: { clientX: number; clientY: number }) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    return { x: e.clientX - (bounds?.left ?? 0), y: e.clientY - (bounds?.top ?? 0) }
  }

  const handleBoxPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!boxSelectMode || e.button !== 0) return
    const p = pointFromEvent(e)
    draggingRef.current = true
    setDragRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  const handleBoxPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const p = pointFromEvent(e)
    setDragRect((prev) => (prev ? { ...prev, x1: p.x, y1: p.y } : prev))
  }

  const handleBoxPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const finalRect = dragRect
    setDragRect(null)
    if (!finalRect) return

    const minX = Math.min(finalRect.x0, finalRect.x1)
    const maxX = Math.max(finalRect.x0, finalRect.x1)
    const minY = Math.min(finalRect.y0, finalRect.y1)
    const maxY = Math.max(finalRect.y0, finalRect.y1)
    if (maxX - minX < MIN_DRAG_PX && maxY - minY < MIN_DRAG_PX) return

    const positions = useModelStore.getState().getPartScreenPositions?.() ?? []
    const ids = positions
      .filter((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
      .map((p) => p.id)
    setBoxSelection(ids, e.ctrlKey || e.metaKey)
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerDown={handleBoxPointerDown}
      onPointerMove={handleBoxPointerMove}
      onPointerUp={handleBoxPointerUp}
    >
      <Canvas
        className="!absolute inset-0"
        style={{ pointerEvents: 'auto', cursor: crosshair ? 'crosshair' : 'auto' }}
        camera={{ position: [4, 3, 6], fov: 45, near: 0.01, far: 5000 }}
        // preserveDrawingBuffer: without it, the browser is free to clear the
        // WebGL drawing buffer right after compositing each frame, which
        // makes canvas.toDataURL() calls (the 4-view PDF capture, PNG export)
        // unreliable/blank depending on exactly when they happen to run
        // relative to that clear - a well-known WebGL screenshot gotcha.
        gl={{ antialias: true, localClippingEnabled: true, alpha: true, preserveDrawingBuffer: true }}
        shadows
        onPointerMissed={() => {
          if (!crosshair) clearSelection()
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      {dragRect && (
        <div
          className="pointer-events-none absolute border border-sky-400 bg-sky-400/20"
          style={{
            left: Math.min(dragRect.x0, dragRect.x1),
            top: Math.min(dragRect.y0, dragRect.y1),
            width: Math.abs(dragRect.x1 - dragRect.x0),
            height: Math.abs(dragRect.y1 - dragRect.y0),
          }}
        />
      )}

      {/* Touch measure precision aid: a fingertip covers whatever it's
          touching, so this crosshair sits 40px above the actual touch point
          instead - offers the same "see what you're about to snap to"
          feedback a mouse gets for free from hovering. */}
      {measureMode && isTouch && measureTouchScreenPos && (
        <div
          className="pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            position: 'fixed',
            left: measureTouchScreenPos.x,
            top: measureTouchScreenPos.y - 40,
          }}
        >
          <div className="h-9 w-9 rounded-full border-2 border-sky-400 bg-sky-400/10" />
          <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-sky-400" />
          <div className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-sky-400" />
        </div>
      )}

      {measureMode && isMobile && measurePendingPoint && (
        <button
          onClick={() => {
            setMeasurePendingPoint(null)
            setMeasurePendingSnap(null)
          }}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#16162a]/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          <X size={16} /> Annuler le point
        </button>
      )}
    </div>
  )
}
