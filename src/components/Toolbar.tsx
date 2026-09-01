import { useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Box,
  BoxSelect,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Crosshair,
  Droplet,
  Droplets,
  FolderOpen,
  Gem,
  Grid3x3,
  Group,
  HelpCircle,
  Layers,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  Minus,
  Palette,
  Pipette,
  Ruler,
  Square,
  SquareDashed,
  Waves,
  Wind,
  Repeat,
} from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { useDevice } from '../hooks/useDevice'
import { OPEN_FILE_ACCEPT, useFileLoader } from '../hooks/useFileLoader'
import { collectNodeIds } from '../utils/componentTree'
import { FLUID_TYPES, type FlowFluidType } from '../utils/fluidTypes'
import { FileMenu } from './FileMenu'
import { AnimationAssistantToggle } from './AnimationAssistant'
import type { DisplayMode, ViewPreset } from '../types/model'

const MODES: {
  id: DisplayMode
  label: string
  shortcut: string
  icon: ComponentType<{ size?: number }>
}[] = [
  { id: 'shaded-edges', label: 'Ombré avec arêtes', shortcut: '1', icon: Layers },
  { id: 'shaded', label: 'Ombré', shortcut: '2', icon: Box },
  { id: 'wireframe', label: 'Filaire', shortcut: '3', icon: Grid3x3 },
  { id: 'hidden-lines-visible', label: 'Lignes cachées visibles', shortcut: '4', icon: SquareDashed },
  { id: 'hidden-lines-removed', label: 'Lignes cachées supprimées', shortcut: '5', icon: Square },
  { id: 'realistic', label: 'Rendu réaliste', shortcut: '6', icon: Gem },
]

const VIEWS: { id: ViewPreset; label: string; abbr: string }[] = [
  { id: 'front', label: 'Face', abbr: 'FA' },
  { id: 'back', label: 'Arrière', abbr: 'AR' },
  { id: 'left', label: 'Gauche', abbr: 'GA' },
  { id: 'right', label: 'Droite', abbr: 'DR' },
  { id: 'top', label: 'Dessus', abbr: 'DE' },
  { id: 'bottom', label: 'Dessous', abbr: 'SO' },
  { id: 'iso', label: 'Isométrique', abbr: 'ISO' },
]

// Opening a file, display modes, the click-to-place tools, and the
// appearance/grouping toggles that used to live in StatusBar.tsx (moved
// back up next to Sélection rectangle on request). View/color reset, the
// file summary, and the theme switcher stay down in the status bar.
export function Toolbar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { loadFile } = useFileLoader()
  const { isMobile } = useDevice()
  const pushToast = useToastStore((s) => s.pushToast)
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false)
  const displayMode = useModelStore((s) => s.displayMode)
  const setDisplayMode = useModelStore((s) => s.setDisplayMode)
  const goToView = useModelStore((s) => s.goToView)
  const object = useModelStore((s) => s.object)
  const clearModel = useModelStore((s) => s.clearModel)
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const pickedColor = useModelStore((s) => s.pickedColor)
  const togglePipetteMode = useModelStore((s) => s.togglePipetteMode)
  const measureMode = useModelStore((s) => s.measureMode)
  const toggleMeasureMode = useModelStore((s) => s.toggleMeasureMode)
  const annotationMode = useModelStore((s) => s.annotationMode)
  const toggleAnnotationMode = useModelStore((s) => s.toggleAnnotationMode)
  const flowPickMode = useModelStore((s) => s.flowPickMode)
  const toggleFlowPickMode = useModelStore((s) => s.toggleFlowPickMode)
  const flowPath = useModelStore((s) => s.flowPath)
  const addFlowPathPointRelative = useModelStore((s) => s.addFlowPathPointRelative)
  const undoFlowPathPoint = useModelStore((s) => s.undoFlowPathPoint)
  const clearFlowPath = useModelStore((s) => s.clearFlowPath)
  const reverseFlowPath = useModelStore((s) => s.reverseFlowPath)
  const flowPlaying = useModelStore((s) => s.flowPlaying)
  const setFlowPlaying = useModelStore((s) => s.setFlowPlaying)
  const flowSpeed = useModelStore((s) => s.flowSpeed)
  const setFlowSpeed = useModelStore((s) => s.setFlowSpeed)
  const flowFluidType = useModelStore((s) => s.flowFluidType)
  const setFlowFluidType = useModelStore((s) => s.setFlowFluidType)
  const flowTrajectoryShape = useModelStore((s) => s.flowTrajectoryShape)
  const setFlowTrajectoryShape = useModelStore((s) => s.setFlowTrajectoryShape)
  const flowCircularAxis = useModelStore((s) => s.flowCircularAxis)
  const setFlowCircularAxis = useModelStore((s) => s.setFlowCircularAxis)
  const flowCircularTurns = useModelStore((s) => s.flowCircularTurns)
  const setFlowCircularTurns = useModelStore((s) => s.setFlowCircularTurns)
  const flowPassageCandidates = useModelStore((s) => s.flowPassageCandidates)
  const flowPassageIndex = useModelStore((s) => s.flowPassageIndex)
  const nextFlowPassage = useModelStore((s) => s.nextFlowPassage)
  const useFlowPassage = useModelStore((s) => s.useFlowPassage)
  const dismissFlowPassages = useModelStore((s) => s.dismissFlowPassages)
  const [precisePanelOpen, setPrecisePanelOpen] = useState(false)
  const [preciseAxis, setPreciseAxis] = useState<'x' | 'y' | 'z'>('y')
  const [preciseDistance, setPreciseDistance] = useState(50)
  const [preciseAngle, setPreciseAngle] = useState(0)
  const boxSelectMode = useModelStore((s) => s.boxSelectMode)
  const toggleBoxSelectMode = useModelStore((s) => s.toggleBoxSelectMode)
  const tree = useModelStore((s) => s.tree)
  const opacity = useModelStore((s) => s.opacity)
  const setAllOpacity = useModelStore((s) => s.setAllOpacity)
  const colorMode = useModelStore((s) => s.colorMode)
  const setColorMode = useModelStore((s) => s.setColorMode)
  const showGrid = useModelStore((s) => s.showGrid)
  const setShowGrid = useModelStore((s) => s.setShowGrid)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const setExplodeFactor = useModelStore((s) => s.setExplodeFactor)
  const [showExplodeSlider, setShowExplodeSlider] = useState(false)
  const showAutoDimensions = useModelStore((s) => s.showAutoDimensions)
  const toggleAutoDimensions = useModelStore((s) => s.toggleAutoDimensions)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const setShowGroupNamePrompt = useModelStore((s) => s.setShowGroupNamePrompt)
  const toggleHelp = useModelStore((s) => s.toggleHelp)

  const isAllTransparent = useMemo(() => {
    if (!tree) return false
    const ids = collectNodeIds(tree)
    return ids.length > 0 && ids.every((id) => (opacity[id] ?? 1) < 0.999)
  }, [tree, opacity])

  const toggleExplode = () => {
    if (explodeFactor > 0) {
      setExplodeFactor(0)
      setShowExplodeSlider(false)
    } else {
      setExplodeFactor(0.4)
      setShowExplodeSlider(true)
    }
  }

  return (
    <header className="border-b border-[var(--border-light)] bg-[var(--bg-toolbar)]">
      <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5">
        <button
          title="Retour à l'écran d'accueil"
          onClick={() => clearModel()}
          className="h-8 w-8 shrink-0 overflow-hidden rounded-md"
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="PindiCADViewer"
            className="h-auto w-full"
            style={{ transform: 'scale(1.3)', transformOrigin: 'top center' }}
          />
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={OPEN_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) loadFile(e.target.files[0])
            e.target.value = ''
          }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400"
        >
          <FolderOpen size={16} /> Ouvrir
        </button>

        <FileMenu />

        <div className="h-5 w-px shrink-0 bg-[var(--bg-hover)]" />

        <div className="flex shrink-0 items-center rounded-lg bg-[var(--bg-hover)] p-0.5">
          {MODES.map(({ id, label, shortcut, icon: Icon }) => (
            <button
              key={id}
              title={`${label} (${shortcut})`}
              onClick={() => setDisplayMode(id)}
              disabled={!object}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                displayMode === id
                  ? 'bg-[var(--bg-active)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>

        <div className="h-5 w-px shrink-0 bg-[var(--bg-hover)]" />

        <button
          title="Pipette à couleur"
          onClick={() => {
            if (isMobile && !pipetteMode) pushToast('Touchez une pièce pour prélever sa couleur')
            togglePipetteMode()
          }}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            pipetteMode
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Pipette size={14} />
          <span className="hidden sm:inline">Pipette</span>
        </button>

        {pipetteMode && !isMobile && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-sky-300">
            {pickedColor && (
              <span
                className="h-3 w-3 rounded-full border border-white/40"
                style={{ backgroundColor: pickedColor }}
              />
            )}
            {pickedColor
              ? 'Couleur prélevée — cliquez sur les pièces à colorier'
              : 'Cliquez sur une pièce pour prélever sa couleur'}
          </span>
        )}

        <button
          title="Mesure"
          onClick={() => {
            if (isMobile && !measureMode) pushToast('Touchez une pièce pour placer un point de mesure')
            toggleMeasureMode()
          }}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            measureMode
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Ruler size={14} />
          <span className="hidden sm:inline">Mesure</span>
        </button>

        {measureMode && !isMobile && (
          <span className="shrink-0 text-xs text-sky-300">
            Cliquez sur une pièce pour placer un point de mesure
          </span>
        )}

        <button
          title="Annoter"
          onClick={() => {
            if (isMobile && !annotationMode) pushToast('Touchez une pièce pour placer une annotation')
            toggleAnnotationMode()
          }}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            annotationMode
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <MessageSquare size={14} />
          <span className="hidden sm:inline">Annoter</span>
        </button>

        {annotationMode && !isMobile && (
          <span className="shrink-0 text-xs text-sky-300">Cliquez sur une pièce pour placer une annotation</span>
        )}

        <button
          title="Flux d'eau"
          onClick={() => {
            if (isMobile && !flowPickMode) pushToast('Touchez la pièce pour tracer le trajet du fluide')
            toggleFlowPickMode()
          }}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            flowPickMode
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Waves size={14} />
          <span className="hidden sm:inline">Flux d'eau</span>
        </button>

        {flowPickMode && flowPassageCandidates.length > 0 && !isMobile && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
            Passage détecté : ⌀{flowPassageCandidates[flowPassageIndex].diameter.toFixed(1)}mm, longueur{' '}
            {flowPassageCandidates[flowPassageIndex].length.toFixed(1)}mm — Entrée par le haut ?
            <button
              onClick={() => useFlowPassage(false)}
              className="rounded bg-sky-500 px-1.5 py-0.5 font-medium text-white hover:bg-sky-400"
            >
              Utiliser
            </button>
            <button
              onClick={() => useFlowPassage(true)}
              className="rounded bg-white/5 px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Inverser
            </button>
            {flowPassageCandidates.length > 1 && (
              <button
                onClick={nextFlowPassage}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Suivant ({flowPassageIndex + 1}/{flowPassageCandidates.length})
              </button>
            )}
            <button onClick={dismissFlowPassages} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Ignorer
            </button>
          </span>
        )}

        {(flowPickMode || flowPath.length > 0) && !isMobile && (
          <span className="flex shrink-0 items-center gap-2 text-xs text-sky-300">
            <span className="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5">
              {(Object.entries(FLUID_TYPES) as [FlowFluidType, (typeof FLUID_TYPES)[FlowFluidType]][]).map(
                ([type, config]) => {
                  const Icon = config.shape === 'arrow' ? Wind : Droplet
                  const active = flowFluidType === type
                  return (
                    <button
                      key={type}
                      title={config.label}
                      onClick={() => setFlowFluidType(type)}
                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${
                        active ? 'text-slate-900' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      style={active ? { backgroundColor: config.color } : undefined}
                    >
                      <Icon size={12} />
                      {config.label}
                    </button>
                  )
                },
              )}
            </span>
            <span className="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5">
              <button
                title="Trajectoire linéaire"
                onClick={() => setFlowTrajectoryShape('linear')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${
                  flowTrajectoryShape === 'linear'
                    ? 'bg-sky-500 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Minus size={12} /> Linéaire
              </button>
              <button
                title="Trajectoire circulaire"
                onClick={() => setFlowTrajectoryShape('circular')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${
                  flowTrajectoryShape === 'circular'
                    ? 'bg-sky-500 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <CircleDot size={12} /> Circulaire
              </button>
            </span>
            {flowTrajectoryShape === 'circular' && (
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="text-[11px]">Axe</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <button
                      key={axis}
                      onClick={() => setFlowCircularAxis(axis)}
                      className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold uppercase ${
                        flowCircularAxis === axis
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/5 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {axis}
                    </button>
                  ))}
                </span>
                <label className="flex items-center gap-1">
                  <span className="text-[11px]">Tours</span>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={flowCircularTurns}
                    onChange={(e) => setFlowCircularTurns(Number(e.target.value))}
                    className="w-12 rounded border border-[var(--border-light)] bg-[#0f0f1e] px-1 py-0.5 text-right text-[11px] text-slate-200"
                  />
                </label>
              </span>
            )}
            {flowPickMode && (
              <span>
                Cliquez sur la pièce pour tracer le trajet ({flowPath.length} pt.) — cliquez un point placé pour le
                déplacer
              </span>
            )}
            {flowPickMode && (
              <div className="relative">
                <button
                  onClick={() => setPrecisePanelOpen((open) => !open)}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
                    precisePanelOpen ? 'bg-sky-500 text-white' : 'bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Crosshair size={12} /> Point précis
                </button>
                {precisePanelOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1 w-60 space-y-2.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] p-3 text-left text-[var(--text-secondary)] shadow-xl">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Point relatif au précédent
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]">Axe</span>
                      <div className="flex gap-1">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                          <button
                            key={axis}
                            onClick={() => setPreciseAxis(axis)}
                            className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold uppercase ${
                              preciseAxis === axis ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {axis}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between text-[11px]">
                      <span>Distance (mm)</span>
                      <input
                        type="number"
                        value={preciseDistance}
                        onChange={(e) => setPreciseDistance(Number(e.target.value))}
                        className="w-20 rounded border border-[var(--border-light)] bg-[#0f0f1e] px-1.5 py-1 text-right text-xs text-slate-200"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px]">
                      <span className="shrink-0">Angle</span>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={preciseAngle}
                        onChange={(e) => setPreciseAngle(Number(e.target.value))}
                        className="h-1 w-full accent-sky-500"
                      />
                      <span className="w-9 shrink-0 text-right">{preciseAngle}°</span>
                    </label>
                    <button
                      onClick={() => addFlowPathPointRelative(preciseAxis, preciseDistance, preciseAngle)}
                      className="w-full rounded-md bg-sky-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-400"
                    >
                      Valider
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={undoFlowPathPoint}
              disabled={flowPath.length === 0}
              className="rounded-md bg-white/5 px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
            >
              Annuler point
            </button>
            <button
              title="Inverser le sens du trajet"
              onClick={reverseFlowPath}
              disabled={flowPath.length < 2}
              className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
            >
              <Repeat size={12} /> Inverser le sens
            </button>
            <button
              onClick={clearFlowPath}
              disabled={flowPath.length === 0}
              className="rounded-md bg-white/5 px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
            >
              Effacer
            </button>
            <button
              onClick={() => setFlowPlaying(!flowPlaying)}
              disabled={flowPath.length < 2}
              className={`rounded-md px-1.5 py-0.5 font-medium disabled:pointer-events-none disabled:opacity-30 ${
                flowPlaying ? 'bg-sky-500 text-white' : 'bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {flowPlaying ? 'Arrêter' : 'Lancer'}
            </button>
            {flowPath.length >= 2 && (
              <input
                type="range"
                min={0.05}
                max={0.6}
                step={0.05}
                value={flowSpeed}
                onChange={(e) => setFlowSpeed(Number(e.target.value))}
                title="Vitesse d'écoulement"
                className="h-1 w-16 accent-sky-500"
              />
            )}
          </span>
        )}

        <button
          title="Sélection rectangle"
          onClick={() => {
            if (isMobile && !boxSelectMode) pushToast('Glissez pour sélectionner les pièces dans le rectangle')
            toggleBoxSelectMode()
          }}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            boxSelectMode
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BoxSelect size={14} />
          <span className="hidden sm:inline">Sélection rectangle</span>
        </button>

        {boxSelectMode && !isMobile && (
          <span className="shrink-0 text-xs text-sky-300">
            Glissez pour sélectionner les pièces dans le rectangle
          </span>
        )}

        <div className="h-5 w-px shrink-0 bg-[var(--bg-hover)]" />

        <button
          title="Grille au sol"
          onClick={() => setShowGrid(!showGrid)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showGrid
              ? 'bg-[var(--bg-active)] text-white'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <LayoutGrid size={14} />
          <span className="hidden sm:inline">Grille</span>
        </button>

        <button
          title="Transparence globale"
          onClick={() => setAllOpacity(isAllTransparent ? 1 : 0.3)}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            isAllTransparent
              ? 'bg-[var(--bg-active)] text-white'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Droplets size={14} />
          <span className="hidden sm:inline">{isAllTransparent ? 'Tout opaque' : 'Tout transparent'}</span>
        </button>

        <button
          title="Couleurs par pièce"
          onClick={() => setColorMode(colorMode === 'palette' ? 'standard' : 'palette')}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            colorMode === 'palette'
              ? 'bg-[var(--bg-active)] text-white'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Palette size={14} />
          <span className="hidden sm:inline">Couleurs par pièce</span>
        </button>

        <button
          title="Vue éclatée"
          onClick={toggleExplode}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            explodeFactor > 0
              ? 'bg-[var(--bg-active)] text-white'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Maximize2 size={14} />
          <span className="hidden sm:inline">Éclater</span>
        </button>

        {showExplodeSlider && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodeFactor}
              onChange={(e) => setExplodeFactor(Number(e.target.value))}
              className="h-1 w-24 accent-[var(--bg-active)]"
            />
            <span className="w-9 shrink-0 text-right text-[11px] text-[var(--text-muted)]">
              {Math.round(explodeFactor * 100)}%
            </span>
          </label>
        )}

        <button
          title="Grouper la sélection"
          onClick={() => setShowGroupNamePrompt(true)}
          disabled={selectedNodeIds.length < 2}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
        >
          <Group size={14} />
          <span className="hidden sm:inline">Grouper</span>
        </button>

        <button
          title="Fiche de cotes automatique"
          onClick={() => toggleAutoDimensions()}
          disabled={!object}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            showAutoDimensions
              ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
              : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ClipboardList size={14} />
          <span className="hidden sm:inline">Cotes auto</span>
        </button>

        <AnimationAssistantToggle />

        <div className="ml-auto flex shrink-0 items-center">
          <button
            title="Aide (? ou F1)"
            onClick={() => toggleHelp()}
            className="shrink-0 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {isMobile ? (
        <div className="relative px-4 pb-2.5">
          <button
            title="Vues"
            disabled={!object}
            onClick={() => setViewsMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
          >
            Vues <ChevronDown size={13} />
          </button>
          {viewsMenuOpen && (
            <>
              {/* Click-outside catcher, kept as a sibling rather than a
                  parent of the menu below - nesting the menu inside this
                  fixed inset-0 div made IT the nearest positioned ancestor,
                  so the menu's "top-full" resolved against the whole
                  viewport's height instead of this button's own wrapper,
                  rendering the menu far off-screen (100% of page height
                  down) - open but completely unreachable on touch. */}
              <div className="fixed inset-0 z-40" onClick={() => setViewsMenuOpen(false)} />
              <div
                className="absolute left-4 top-full z-50 mt-1 flex w-40 flex-col overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] py-1 text-sm shadow-xl"
              >
                {VIEWS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => {
                      goToView?.(id)
                      setViewsMenuOpen(false)
                    }}
                    className="px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Vues
          </span>
          {VIEWS.map(({ id, label, abbr }) => (
            <button
              key={id}
              title={label}
              disabled={!object}
              onClick={() => goToView?.(id)}
              className="shrink-0 rounded-md bg-[var(--bg-hover)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
            >
              {abbr}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
