import { EyeOff, Group, Ungroup } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { findNodeById } from '../utils/componentTree'

const MENU_WIDTH = 200

export function ContextMenu() {
  const contextMenu = useModelStore((s) => s.contextMenu)
  const tree = useModelStore((s) => s.tree)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const closeContextMenu = useModelStore((s) => s.closeContextMenu)
  const setNodeOpacity = useModelStore((s) => s.setNodeOpacity)
  const setOpacityForSelection = useModelStore((s) => s.setOpacityForSelection)
  const toggleComponentVisibility = useModelStore((s) => s.toggleComponentVisibility)
  const setVisibilityForSelection = useModelStore((s) => s.setVisibilityForSelection)
  const setShowGroupNamePrompt = useModelStore((s) => s.setShowGroupNamePrompt)
  const ungroupNode = useModelStore((s) => s.ungroupNode)

  if (!contextMenu || !tree) return null

  const node = findNodeById(tree, contextMenu.nodeId)
  if (!node) return null

  // Right-clicking a part that's already part of a multi-selection acts on
  // the whole selection, same rule the color/opacity controls elsewhere
  // follow (see useModelState.ts) - right-clicking anything else acts on
  // just that one part.
  const actsOnSelection = selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)

  const left = Math.min(contextMenu.x, window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(contextMenu.y, window.innerHeight - 220)

  const runAndClose = (action: () => void) => {
    action()
    closeContextMenu()
  }

  return (
    <div className="fixed inset-0 z-50" onClick={closeContextMenu} onContextMenu={(e) => e.preventDefault()}>
      <div
        style={{ left, top, width: MENU_WIDTH }}
        onClick={(e) => e.stopPropagation()}
        className="absolute overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] py-1 text-sm shadow-xl"
      >
        <p className="truncate border-b border-[var(--border-light)] px-3 py-1.5 text-xs font-medium text-slate-500">
          {actsOnSelection ? `${selectedNodeIds.length} pièces sélectionnées` : node.name}
        </p>
        <button
          onClick={() =>
            runAndClose(() => (actsOnSelection ? setOpacityForSelection(0.3) : setNodeOpacity(node.id, 0.3)))
          }
          className="flex w-full items-center px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
        >
          Rendre transparent
        </button>
        <button
          onClick={() =>
            runAndClose(() => (actsOnSelection ? setOpacityForSelection(1) : setNodeOpacity(node.id, 1)))
          }
          className="flex w-full items-center px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
        >
          Rendre opaque
        </button>
        <button
          onClick={() =>
            runAndClose(() =>
              actsOnSelection ? setVisibilityForSelection(false) : toggleComponentVisibility(node.id),
            )
          }
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
        >
          <EyeOff size={14} className="text-slate-500" />
          Masquer
        </button>

        {selectedNodeIds.length >= 2 && (
          <>
            <div className="my-1 h-px bg-white/5" />
            <button
              onClick={() => runAndClose(() => setShowGroupNamePrompt(true))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Group size={14} className="text-slate-500" />
              Créer un groupe
            </button>
          </>
        )}

        {node.isGroup && (
          <>
            <div className="my-1 h-px bg-white/5" />
            <button
              onClick={() => runAndClose(() => ungroupNode(node.id))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Ungroup size={14} className="text-slate-500" />
              Dissocier
            </button>
          </>
        )}
      </div>
    </div>
  )
}
