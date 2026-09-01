import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useDevice } from '../hooks/useDevice'
import { findNodeById, getNodeStats, getPrimaryMaterial } from '../utils/componentTree'

function formatDimension(value: number) {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1)
}

export function ModelInfoPanel() {
  const colorInputRef = useRef<HTMLInputElement>(null)
  const { isMobile } = useDevice()
  // Compact by default on mobile - the bottom-right floating panel desktop
  // uses would otherwise sit over the viewer with a finger's worth of
  // detail no one asked to see yet; expand it on tap instead.
  const [expanded, setExpanded] = useState(false)
  const object = useModelStore((s) => s.object)
  const fileName = useModelStore((s) => s.fileName)
  const triangleCount = useModelStore((s) => s.triangleCount)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const tree = useModelStore((s) => s.tree)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const customColors = useModelStore((s) => s.customColors)
  const setNodeColor = useModelStore((s) => s.setNodeColor)
  const resetNodeColor = useModelStore((s) => s.resetNodeColor)
  const setColorForSelection = useModelStore((s) => s.setColorForSelection)
  const resetColorForSelection = useModelStore((s) => s.resetColorForSelection)

  // Single selection keeps the exact original per-node view (name, own
  // stats, own color). More than one selected part aggregates: combined
  // triangle count and bounding box across every selected subtree, and a
  // color swatch that edits ALL of them at once (see setColorForSelection)
  // - previewed from the first selected part's own color, since a mixed
  // selection has no single "the" color to show.
  const selected = useMemo(() => {
    if (!tree || selectedNodeIds.length === 0) return null
    const nodes = selectedNodeIds.map((id) => findNodeById(tree, id)).filter((n) => n !== null)
    if (nodes.length === 0) return null
    if (nodes.length === 1) return { name: nodes[0].name, ...getNodeStats(nodes[0]), previewMesh: nodes[0].mesh }

    const boundingBoxUnion = new THREE.Box3()
    let triangleTotal = 0
    for (const node of nodes) {
      const stats = getNodeStats(node)
      triangleTotal += stats.triangleCount
      boundingBoxUnion.union(stats.boundingBox)
    }
    return {
      name: `${nodes.length} pièces sélectionnées`,
      triangleCount: triangleTotal,
      boundingBox: boundingBoxUnion,
      previewMesh: nodes[0].mesh,
    }
  }, [selectedNodeIds, tree])

  if (!object || !fileName) return null

  const name = selected ? selected.name : fileName
  const triangles = selected ? Math.round(selected.triangleCount) : triangleCount
  const size = (selected?.boundingBox ?? boundingBox)?.getSize(new THREE.Vector3())
  const material = selected?.previewMesh ? getPrimaryMaterial(selected.previewMesh) : undefined
  const isMultiSelection = selectedNodeIds.length > 1
  const hasCustomColor = isMultiSelection
    ? selectedNodeIds.some((id) => customColors[id])
    : selectedNodeIds.length === 1 && Boolean(customColors[selectedNodeIds[0]])

  // Compact mobile view: name + dimensions only, in a wider bottom-anchored
  // bar that's easier to read/tap than the desktop corner box would be at
  // phone width. A chevron expands it to the full detail (triangle count,
  // color controls) instead of a drag-to-expand gesture, which is far
  // easier to get reliably right without a real touch device to test on.
  const showFullDetail = !isMobile || expanded

  // Deliberately NOT pointer-events-none: that used to be paired with
  // pointer-events-auto on each button below so taps on the card's own
  // padding/background would still fall through to orbit the canvas behind
  // it, but mobile Safari's hit-testing for a pointer-events-auto
  // descendant inside a pointer-events-none + backdrop-blur ancestor is
  // unreliable - a tap that should've hit the button landed on the canvas
  // instead, read as a random view change. The card is a small fixed
  // rectangle at the bottom of the screen, so simply owning every tap
  // inside it is a fine trade for taps there no longer reaching the canvas.
  return (
    <div
      className={
        isMobile
          ? 'absolute inset-x-3 bottom-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)]/95 px-3 py-2 text-xs text-slate-400 backdrop-blur-sm'
          : 'absolute bottom-4 right-4 max-w-[240px] rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)]/90 px-3 py-2 text-xs text-slate-400 backdrop-blur-sm'
      }
    >
      {selected && showFullDetail && (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: '#ff8c00' }}>
          {isMultiSelection ? 'Sélection multiple' : 'Pièce sélectionnée'}
        </p>
      )}
      <div className="flex items-center gap-2">
        {selected && material && showFullDetail && (
          <>
            <input
              ref={colorInputRef}
              type="color"
              value={`#${material.color.getHexString()}`}
              onChange={(e) => {
                if (isMultiSelection) setColorForSelection(e.target.value)
                else setNodeColor(selectedNodeIds[0], e.target.value)
              }}
              className="sr-only"
            />
            {/* Padding here (offset by -m so it doesn't shift the layout)
                enlarges the actual tap target well past the small visible
                swatch, on top of the whole card now capturing its own taps
                (see the wrapping div above). */}
            <button
              title="Changer la couleur"
              onClick={() => colorInputRef.current?.click()}
              className="-m-2 shrink-0 rounded-full p-2"
            >
              <span
                style={{ backgroundColor: `#${material.color.getHexString()}` }}
                className="block h-3.5 w-3.5 rounded-full border border-white/30"
              />
            </button>
            {hasCustomColor && (
              <button
                title="Réinitialiser la couleur"
                onClick={() => (isMultiSelection ? resetColorForSelection() : resetNodeColor(selectedNodeIds[0]))}
                className="-m-2 shrink-0 rounded-full p-2 text-slate-500 hover:text-slate-200"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </>
        )}
        <p className="min-w-0 flex-1 truncate font-medium text-slate-200">{name}</p>
        {isMobile && (
          <button
            title={expanded ? 'Réduire' : 'Plus de détails'}
            onClick={() => setExpanded((v) => !v)}
            className="-m-2 shrink-0 rounded-full p-2 text-slate-500 hover:text-slate-200"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
      </div>
      {showFullDetail && <p className="mt-1">{triangles.toLocaleString('fr-FR')} triangles</p>}
      {size && (
        <p>
          {formatDimension(size.x)} × {formatDimension(size.z)} × {formatDimension(size.y)} mm{' '}
          <span className="text-slate-600">(L×l×H)</span>
        </p>
      )}
    </div>
  )
}
