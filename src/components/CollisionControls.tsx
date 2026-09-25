import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { ToolButton } from './ToolButton'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { collectMeshes, findNodeById } from '../utils/componentTree'
import { findAllInterferences } from '../utils/collision'
import { clearCollisionHighlight, setCollisionHighlight } from '../utils/collisionFeedback'

const chip = (active: boolean) =>
  `shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? 'bg-[var(--bg-active)] text-white'
      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
  }`

// The "Collision" toggle: switches the move-with-collision gizmo on (see
// CollisionMover).
export function CollisionButton() {
  const object = useModelStore((s) => s.object)
  const collisionMode = useModelStore((s) => s.collisionMode)
  const setCollisionMode = useModelStore((s) => s.setCollisionMode)

  return (
    <ToolButton
      icon={ShieldAlert}
      label="Collision"
      title="Déplacer une pièce avec détection de collision"
      active={collisionMode}
      disabled={!object}
      onClick={() => {
        clearCollisionHighlight()
        setCollisionMode(!collisionMode)
      }}
    />
  )
}

// Options shown in the toolbar's context strip while the collision tool is
// on: gizmo mode, sound, and the whole-assembly interference scan.
export function CollisionOptions() {
  const object = useModelStore((s) => s.object)
  const tree = useModelStore((s) => s.tree)
  const collisionMode = useModelStore((s) => s.collisionMode)
  const collisionTransform = useModelStore((s) => s.collisionTransform)
  const setCollisionTransform = useModelStore((s) => s.setCollisionTransform)
  const collisionSound = useModelStore((s) => s.collisionSound)
  const setCollisionSound = useModelStore((s) => s.setCollisionSound)
  const collisionContact = useModelStore((s) => s.collisionContact)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const pushToast = useToastStore((s) => s.pushToast)
  const [showingInterferences, setShowingInterferences] = useState(false)

  if (!collisionMode) return null

  const toggleInterferences = () => {
    if (showingInterferences) {
      clearCollisionHighlight()
      setShowingInterferences(false)
      return
    }
    if (!object || !tree) return
    object.updateMatrixWorld(true)
    const pairs = findAllInterferences(collectMeshes(tree))
    if (pairs.length === 0) {
      pushToast('Aucune interférence détectée.')
      return
    }
    setCollisionHighlight(pairs.flat())
    setShowingInterferences(true)
    const nameOf = (mesh: { userData: Record<string, unknown> }) =>
      findNodeById(tree, mesh.userData.nodeId as string)?.name ?? 'pièce'
    const list = pairs
      .slice(0, 3)
      .map(([a, b]) => `${nameOf(a)} ↔ ${nameOf(b)}`)
      .join(', ')
    pushToast(`${pairs.length} interférence(s) : ${list}${pairs.length > 3 ? '…' : ''}`)
  }

  let hint: string | null = null
  if (explodeFactor > 0) hint = "Remettez l'éclatement à 0 pour déplacer une pièce."
  else if (selectedNodeIds.length === 0) hint = 'Sélectionnez une pièce à déplacer.'

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Collision</span>
      <button className={chip(collisionTransform === 'translate')} onClick={() => setCollisionTransform('translate')}>
        Déplacer
      </button>
      <button className={chip(collisionTransform === 'rotate')} onClick={() => setCollisionTransform('rotate')}>
        Tourner
      </button>
      <button
        title="Bip sonore au moment du blocage"
        className={chip(collisionSound)}
        onClick={() => setCollisionSound(!collisionSound)}
      >
        Son
      </button>
      <button
        title="Repère en rouge les pièces qui se traversent actuellement"
        className={chip(showingInterferences)}
        onClick={toggleInterferences}
      >
        Interférences
      </button>
      {collisionContact ? (
        <span className="shrink-0 rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-400">
          Contact : {collisionContact}
        </span>
      ) : (
        hint && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{hint}</span>
      )}
    </div>
  )
}
