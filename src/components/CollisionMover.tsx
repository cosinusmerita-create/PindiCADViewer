import { useEffect, useMemo, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useModelStore } from '../hooks/useModelState'
import { collectMeshes, findNodeById } from '../utils/componentTree'
import { getOrCreatePivot, type PivotEntry } from '../utils/animationPivot'
import { encodeSelectionKey } from '../utils/selectionKey'
import {
  baselineContacts,
  buildStatics,
  snapshotPose,
  sweepToContact,
  type PoseSnapshot,
  type StaticEntry,
} from '../utils/collision'
import { clearCollisionHighlight, playCollisionBeep, setCollisionHighlight } from '../utils/collisionFeedback'

interface DragSession {
  moving: THREE.Mesh[]
  statics: StaticEntry[]
  ignore: Set<string>
  lastValid: PoseSnapshot
  blocked: boolean
}

// "Dynamique physique" for the viewer: a move/rotate gizmo on the selected
// part(s) whose motion stops dead at the first new contact with another part.
// Runs inside the Canvas (TransformControls needs it) and shares the pivot
// registry with AnimationController, so the reset buttons and every other
// pivot-based feature keep working on the parts moved here.
export function CollisionMover({ registry }: { registry: Map<string, PivotEntry> }) {
  const object = useModelStore((s) => s.object)
  const tree = useModelStore((s) => s.tree)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const collisionMode = useModelStore((s) => s.collisionMode)
  const collisionTransform = useModelStore((s) => s.collisionTransform)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const setCollisionContact = useModelStore((s) => s.setCollisionContact)

  const [entry, setEntry] = useState<PivotEntry | null>(null)
  const session = useRef<DragSession | null>(null)

  const key = useMemo(() => encodeSelectionKey(selectedNodeIds), [selectedNodeIds])
  // While the explosion is active AnimationController rewrites part pivots
  // every frame, which would fight the gizmo - it has to be back at 0 first.
  const active = collisionMode && explodeFactor === 0 && key !== ''

  useEffect(() => {
    if (!active || !object || !tree) {
      setEntry(null)
      return
    }
    setEntry(getOrCreatePivot(registry, object, tree, key))
  }, [active, object, tree, key, registry])

  useEffect(
    () => () => {
      clearCollisionHighlight()
      setCollisionContact(null)
    },
    [setCollisionContact],
  )

  if (!entry || !tree || !object) return null

  const nameOf = (mesh: THREE.Mesh) => {
    const id = mesh.userData.nodeId as string | undefined
    return (id && findNodeById(tree, id)?.name) || 'pièce'
  }

  const onDragStart = () => {
    const moving = entry.meshes
    object.updateMatrixWorld(true)
    const statics = buildStatics(collectMeshes(tree), new Set(moving))
    session.current = {
      moving,
      statics,
      ignore: baselineContacts(moving, statics),
      lastValid: snapshotPose(entry.pivot),
      blocked: false,
    }
  }

  // The gizmo has already written the pointer's target pose into the pivot;
  // sweep from the last collision-free pose toward it and keep whatever part
  // of that path is free.
  const onDragChange = () => {
    const s = session.current
    if (!s) return
    entry.pivot.updateMatrixWorld(true)
    const target = snapshotPose(entry.pivot)
    const { pose, contact } = sweepToContact(entry.pivot, s.moving, s.lastValid, target, s.statics, s.ignore)
    s.lastValid = pose

    if (contact) {
      setCollisionHighlight(contact)
      if (!s.blocked) {
        s.blocked = true
        setCollisionContact(`${nameOf(contact[0])} ↔ ${nameOf(contact[1])}`)
        if (useModelStore.getState().collisionSound) playCollisionBeep()
      }
    } else if (s.blocked) {
      s.blocked = false
      clearCollisionHighlight()
      setCollisionContact(null)
    }
  }

  const onDragEnd = () => {
    session.current = null
    clearCollisionHighlight()
    setCollisionContact(null)
    useModelStore.setState({ hasUnsavedChanges: true })
  }

  return (
    <TransformControls
      object={entry.pivot}
      mode={collisionTransform}
      size={0.8}
      onMouseDown={onDragStart}
      onObjectChange={onDragChange}
      onMouseUp={onDragEnd}
    />
  )
}
