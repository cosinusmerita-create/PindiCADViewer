import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import * as THREE from 'three'
import {
  ChevronDown,
  ChevronRight,
  Droplets,
  Eye,
  EyeOff,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useDevice } from '../hooks/useDevice'
import { collectNodeIds, getPrimaryMaterial } from '../utils/componentTree'
import type { ComponentNode } from '../types/model'

interface TreeRowProps {
  node: ComponentNode
  depth: number
}

// A folder node (mesh: null) has no material of its own, so its swatch
// previews/edits whatever its first descendant part is currently showing -
// good enough as a quick visual cue, since setColorForSelection/setNodeColor
// applied to a folder id cascades the new color to every descendant anyway.
function firstDescendantMaterial(node: ComponentNode): THREE.MeshStandardMaterial | undefined {
  if (node.mesh) return getPrimaryMaterial(node.mesh)
  for (const child of node.children) {
    const found = firstDescendantMaterial(child)
    if (found) return found
  }
  return undefined
}

function TreeRow({ node, depth }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [showOpacitySlider, setShowOpacitySlider] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const visible = useModelStore((s) => s.visibility[node.id] ?? true)
  const opacity = useModelStore((s) => s.opacity[node.id] ?? 1)
  // Subscribed only to force a re-render when the color changes - the swatch
  // itself always reads the live material color directly (see below).
  useModelStore((s) => s.customColors[node.id])
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const selectNode = useModelStore((s) => s.selectNode)
  const toggleNodeSelection = useModelStore((s) => s.toggleNodeSelection)
  const selectRange = useModelStore((s) => s.selectRange)
  const toggleComponentVisibility = useModelStore((s) => s.toggleComponentVisibility)
  const setNodeOpacity = useModelStore((s) => s.setNodeOpacity)
  const setNodeColor = useModelStore((s) => s.setNodeColor)
  const setOpacityForSelection = useModelStore((s) => s.setOpacityForSelection)
  const setColorForSelection = useModelStore((s) => s.setColorForSelection)
  const setVisibilityForSelection = useModelStore((s) => s.setVisibilityForSelection)
  const theme = useModelStore((s) => s.theme)
  const hasChildren = node.children.length > 0
  const material = node.mesh ? getPrimaryMaterial(node.mesh) : firstDescendantMaterial(node)
  const isTransparent = opacity < 0.999
  const isSelected = selectedNodeIds.includes(node.id)
  // A row's own color/opacity controls act on the WHOLE selection once more
  // than one part is selected and this row is part of it - the same rule
  // ModelInfoPanel and the pipette follow (see useModelState.ts).
  const actsOnSelection = isSelected && selectedNodeIds.length > 1

  const hasSelectedDescendant = useMemo(() => {
    if (selectedNodeIds.length === 0 || isSelected) return false
    const descendantIds = collectNodeIds(node)
    return selectedNodeIds.some((id) => descendantIds.includes(id))
  }, [node, selectedNodeIds, isSelected])

  const effectiveExpanded = expanded || hasSelectedDescendant

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [isSelected])

  const stop = (e: MouseEvent) => e.stopPropagation()

  const handleRowClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) toggleNodeSelection(node.id)
    else if (e.shiftKey) selectRange(node.id)
    else selectNode(node.id)
  }

  return (
    <div>
      <div
        ref={rowRef}
        onClick={handleRowClick}
        // Solidworks matches the classic Windows Explorer / SolidWorks tree
        // look - a solid selection fill, not the translucent overlay dark/
        // light use - so it needs its own branch rather than just swapping
        // in the CSS var at the same opacity.
        className={`group flex cursor-pointer items-center gap-1.5 rounded py-1 pr-1.5 text-sm ${
          isSelected
            ? theme === 'solidworks'
              ? 'text-white'
              : 'bg-sky-600/40 ring-1 ring-inset ring-sky-400/60'
            : 'hover:bg-[var(--bg-hover)]'
        }`}
        style={{
          paddingLeft: 6 + depth * 14,
          backgroundColor: isSelected && theme === 'solidworks' ? 'var(--bg-active)' : undefined,
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              stop(e)
              setExpanded((v) => !v)
            }}
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {effectiveExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        <input
          type="checkbox"
          title="Sélectionner"
          checked={isSelected}
          onClick={stop}
          onChange={() => toggleNodeSelection(node.id)}
          className="h-3 w-3 shrink-0 accent-sky-500"
        />

        {!node.mesh && <Folder size={13} className="shrink-0 text-[var(--text-muted)]" />}

        {material && (
          <>
            <input
              ref={colorInputRef}
              type="color"
              value={`#${material.color.getHexString()}`}
              onClick={stop}
              onChange={(e) => {
                if (actsOnSelection) setColorForSelection(e.target.value)
                else setNodeColor(node.id, e.target.value)
              }}
              className="sr-only"
            />
            <button
              title="Changer la couleur"
              onClick={(e) => {
                stop(e)
                colorInputRef.current?.click()
              }}
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/30"
              style={{ backgroundColor: `#${material.color.getHexString()}`, opacity }}
            />
          </>
        )}

        <span
          className={`flex-1 truncate ${isSelected ? 'text-white' : visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
        >
          {node.name}
        </span>

        <button
          title="Opacité"
          onClick={(e) => {
            stop(e)
            setShowOpacitySlider((v) => !v)
          }}
          className={`shrink-0 rounded p-0.5 transition-colors ${
            isTransparent ? 'text-sky-400' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          } ${showOpacitySlider ? 'bg-[var(--bg-hover)]' : ''}`}
        >
          <Droplets size={14} />
        </button>

        <button
          title={visible ? 'Masquer' : 'Afficher'}
          onClick={(e) => {
            stop(e)
            if (actsOnSelection) setVisibilityForSelection(!visible)
            else toggleComponentVisibility(node.id)
          }}
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {showOpacitySlider && (
        <div
          className="flex items-center gap-2 py-1 pr-1.5"
          style={{ paddingLeft: 6 + depth * 14 + 14 }}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => {
              const value = Number(e.target.value)
              if (actsOnSelection) setOpacityForSelection(value)
              else setNodeOpacity(node.id, value)
            }}
            className="h-1 w-full accent-sky-500"
          />
          <span className="w-9 shrink-0 text-right text-[11px] text-[var(--text-muted)]">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}

      {hasChildren &&
        effectiveExpanded &&
        node.children.map((child) => <TreeRow key={child.id} node={child} depth={depth + 1} />)}
    </div>
  )
}

export function ComponentTree() {
  const tree = useModelStore((s) => s.tree)
  const { isMobile } = useDevice()
  // Starts collapsed on a phone-sized screen - a permanently-open sidebar
  // would eat most of the viewport there, unlike on desktop where it's the
  // expected default.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768)

  if (collapsed) {
    return (
      <div className="flex shrink-0 items-start border-r border-[var(--border-light)] bg-[var(--bg-panel)]">
        <button
          title="Afficher l'arborescence"
          onClick={() => setCollapsed(false)}
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    )
  }

  const panelBody = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Composants
        </span>
        <button
          title="Masquer l'arborescence"
          onClick={() => setCollapsed(true)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1.5">
        {tree ? (
          <TreeRow node={tree} depth={0} />
        ) : (
          <p className="px-2 py-2 text-xs text-[var(--text-muted)]">Aucun modèle chargé.</p>
        )}
      </div>
    </>
  )

  // On mobile this floats over the viewer as a drawer (fixed positioning,
  // so it takes no flex space of its own) with a tap-outside-to-close
  // backdrop, instead of permanently squeezing the 3D view like the desktop
  // sidebar does.
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-40 flex" onClick={() => setCollapsed(true)}>
        <aside
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-72 max-w-[85vw] flex-col bg-[var(--bg-panel)] shadow-2xl"
        >
          {panelBody}
        </aside>
        <div className="flex-1 bg-black/40" />
      </div>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-light)] bg-[var(--bg-panel)]">
      {panelBody}
    </aside>
  )
}
