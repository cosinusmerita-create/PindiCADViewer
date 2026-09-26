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
  Expand,
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
  MousePointer2,
  Move,
  Rotate3d,
  ScanSearch,
  ZoomIn,
  Dices,
  Palette,
  Printer,
  Pipette,
  PencilRuler,
  Ruler,
  Square,
  SquareDashed,
  Waves,
  Wind,
  Repeat,
} from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { usePrintStore } from '../hooks/usePrintStore'
import { useDevice } from '../hooks/useDevice'
import { OPEN_FILE_ACCEPT, useFileLoader } from '../hooks/useFileLoader'
import { collectMeshes, collectNodeIds } from '../utils/componentTree'
import { faceRegionsFor } from '../utils/faceColors'
import { FLUID_TYPES, type FlowFluidType } from '../utils/fluidTypes'
import { PAINT_COLORS } from '../utils/colorPalette'
import { FileMenu } from './FileMenu'
import { ExplodeControls } from './ExplodeControls'
import { CollisionButton, CollisionOptions } from './CollisionControls'
import { Divider, ToolButton, ToolGroup } from './ToolButton'
import { ViewActions } from './ViewActions'
import { AnimationAssistantToggle } from './AnimationAssistant'
import type { DisplayMode, NavMode, ViewPreset } from '../types/model'

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

const NAV_TOOLS: { id: NavMode; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'select', label: 'Sélectionner : clic = sélection, glisser = rotation', icon: MousePointer2 },
  { id: 'pan', label: 'Translater : glisser pour déplacer la vue', icon: Move },
  { id: 'rotate', label: 'Rotation : glisser pour faire tourner la vue', icon: Rotate3d },
  { id: 'zoom', label: 'Zoom : glisser vers le haut / le bas pour zoomer', icon: ZoomIn },
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
  const navMode = useModelStore((s) => s.navMode)
  const setNavMode = useModelStore((s) => s.setNavMode)
  const zoomWindowMode = useModelStore((s) => s.zoomWindowMode)
  const toggleZoomWindowMode = useModelStore((s) => s.toggleZoomWindowMode)
  const zoomToFit = useModelStore((s) => s.zoomToFit)
  const object = useModelStore((s) => s.object)
  const clearModel = useModelStore((s) => s.clearModel)
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const paintColor = useModelStore((s) => s.paintColor)
  const setPaintColor = useModelStore((s) => s.setPaintColor)
  const togglePipetteMode = useModelStore((s) => s.togglePipetteMode)
  const measureMode = useModelStore((s) => s.measureMode)
  const toggleMeasureMode = useModelStore((s) => s.toggleMeasureMode)
  const measureVariant = useModelStore((s) => s.measureVariant)
  const toggleManualDimMode = useModelStore((s) => s.toggleManualDimMode)
  const manualDimMode = measureMode && measureVariant === 'edge'
  const manualDimKind = useModelStore((s) => s.manualDimKind)
  const setManualDimKind = useModelStore((s) => s.setManualDimKind)
  const measurePendingPoint = useModelStore((s) => s.measurePendingPoint)
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
  const applyFlowPassage = useModelStore((s) => s.applyFlowPassage)
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
  const randomizePaletteColors = useModelStore((s) => s.randomizePaletteColors)
  const showGrid = useModelStore((s) => s.showGrid)
  const setShowGrid = useModelStore((s) => s.setShowGrid)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const setExplodeFactor = useModelStore((s) => s.setExplodeFactor)
  const [showExplodeSlider, setShowExplodeSlider] = useState(false)
  // A "reset everything" request (Tout réinitialiser, État d'origine) drops
  // the explosion to 0 from outside this component, so the slider strip has
  // to close with it. Adjusting state during render (rather than in an
  // effect) avoids a flash of the stale strip.
  const resetSignal = useModelStore((s) => s.resetSignal)
  const [seenResetId, setSeenResetId] = useState(resetSignal?.requestId ?? 0)
  if ((resetSignal?.requestId ?? 0) !== seenResetId) {
    setSeenResetId(resetSignal?.requestId ?? 0)
    if (resetSignal?.all && showExplodeSlider) setShowExplodeSlider(false)
  }
  // Same for a different (or no) model: closing the project or opening
  // another file must not leave the previous model's slider strip behind.
  const [seenObject, setSeenObject] = useState(object)
  if (object !== seenObject) {
    setSeenObject(object)
    if (showExplodeSlider) setShowExplodeSlider(false)
  }
  const showAutoDimensions = useModelStore((s) => s.showAutoDimensions)
  const toggleAutoDimensions = useModelStore((s) => s.toggleAutoDimensions)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const setShowGroupNamePrompt = useModelStore((s) => s.setShowGroupNamePrompt)
  const toggleHelp = useModelStore((s) => s.toggleHelp)
  const printOpen = usePrintStore((s) => s.open)
  const setPrintOpen = usePrintStore((s) => s.setOpen)

  // A part open on its own with CAD faces (STEP, IGES, BREP): "Couleurs par
  // pièce" colors its faces instead (see faceColors.ts), and says so.
  const byFace = useMemo(() => {
    if (!tree) return false
    const meshes = collectMeshes(tree)
    return meshes.length === 1 && faceRegionsFor(meshes[0]) !== null
  }, [tree])
  const isSinglePart = useMemo(() => !!tree && collectMeshes(tree).length === 1, [tree])

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

  const collisionMode = useModelStore((s) => s.collisionMode)
  const hasContextStrip =
    showExplodeSlider ||
    collisionMode ||
    // The Pipette's colour choice is needed on touch devices too.
    pipetteMode ||
    ((measureMode || annotationMode || boxSelectMode || flowPickMode || flowPath.length > 0) && !isMobile)

  return (
    <header className="border-b border-[var(--border-light)] bg-[var(--bg-toolbar)]">
      {/* Row 1 - file, display mode, standard views, help */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        {/* On desktop the logo lives in the top menu bar (MenuBar.tsx). */}
        {isMobile && (
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
        )}

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

        {isMobile && <FileMenu />}

        <Divider />

        <div title="Mode d'affichage" className="flex shrink-0 items-center rounded-lg bg-[var(--bg-hover)] p-0.5">
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

        {!isMobile && (
          <>
            <Divider />
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
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
          </>
        )}

        <Divider />

        {/* Navigation tools, as in SOLIDWORKS / eDrawings: the first four
            choose what a left-drag does in the view (right-drag pan and the
            wheel zoom always work); Zoom fenêtre is one-shot; Zoom ajusté is
            an immediate action keeping the current orientation. */}
        <div title="Navigation" className="flex shrink-0 items-center rounded-lg bg-[var(--bg-hover)] p-0.5">
          {NAV_TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              onClick={() => setNavMode(id)}
              disabled={!object}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                navMode === id && !zoomWindowMode
                  ? 'bg-[var(--bg-active)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
          <button
            title="Zoom fenêtre : tracez un rectangle sur la zone à agrandir"
            onClick={() => toggleZoomWindowMode()}
            disabled={!object}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
              zoomWindowMode ? 'bg-[var(--bg-active)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ScanSearch size={15} />
          </button>
          <button
            title="Zoom ajusté : cadrer tout le modèle visible (Z)"
            onClick={() => zoomToFit?.()}
            disabled={!object}
            className="flex items-center justify-center rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Expand size={15} />
          </button>
        </div>

        <Divider />

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <ViewActions />
        </div>

        {/* Desktop: help lives in the top menu bar (Aide). Kept here only on
            mobile, where that bar is not shown. */}
        {isMobile && (
          <button
            title="Aide"
            onClick={() => toggleHelp()}
            className="ml-auto shrink-0 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <HelpCircle size={18} />
          </button>
        )}
      </div>

      {isMobile && (
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
      )}

      {/* Row 2 - every tool, grouped by purpose; wraps instead of scrolling */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-[var(--border-light)] px-4 py-2">
        <ToolGroup title="Outils">
          <ToolButton
            icon={Pipette}
            label="Pipette"
            title="Pipette : choisir une couleur et peindre les pièces"
            active={pipetteMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && !pipetteMode) pushToast('Choisissez une couleur puis touchez les pièces à peindre')
              togglePipetteMode()
            }}
          />
          <ToolButton
            icon={Ruler}
            label="Mesure"
            active={measureMode && !manualDimMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && (!measureMode || manualDimMode)) pushToast('Touchez une pièce pour placer un point de mesure')
              toggleMeasureMode()
            }}
          />
          <ToolButton
            icon={MessageSquare}
            label="Annoter"
            active={annotationMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && !annotationMode) pushToast('Touchez une pièce pour placer une annotation')
              toggleAnnotationMode()
            }}
          />
          <ToolButton
            icon={BoxSelect}
            label="Sélection rectangle"
            active={boxSelectMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && !boxSelectMode) pushToast('Glissez pour sélectionner les pièces dans le rectangle')
              toggleBoxSelectMode()
            }}
          />
          <ToolButton
            icon={ClipboardList}
            label="Cotes auto"
            title="Fiche de cotes automatique"
            active={showAutoDimensions}
            mode
            disabled={!object}
            onClick={() => toggleAutoDimensions()}
          />
          <ToolButton
            icon={PencilRuler}
            label="Cotes manuelles"
            title="Cliquez sur une arête pour afficher sa cote (vue lignes cachées supprimées)"
            active={manualDimMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && !manualDimMode) pushToast('Touchez une arête pour afficher sa cote')
              toggleManualDimMode()
            }}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Affichage">
          <ToolButton
            icon={LayoutGrid}
            label="Grille"
            title="Grille au sol"
            active={showGrid}
            onClick={() => setShowGrid(!showGrid)}
          />
          <ToolButton
            icon={Droplets}
            label={isAllTransparent ? 'Tout opaque' : 'Tout transparent'}
            title="Transparence globale"
            active={isAllTransparent}
            disabled={!object}
            onClick={() => setAllOpacity(isAllTransparent ? 1 : 0.3)}
          />
          <ToolButton
            icon={Palette}
            label={byFace ? 'Couleurs par face' : 'Couleurs par pièce'}
            title={
              byFace
                ? 'Une couleur par face de la pièce, pour mieux lire sa forme (un perçage = une face)'
                : isSinglePart
                  ? 'Donne une couleur à la pièce (Couleur aléatoire pour en changer)'
                  : 'Une couleur par pièce ; les pièces identiques partagent la même couleur'
            }
            active={colorMode === 'palette'}
            disabled={!object}
            onClick={() => setColorMode(colorMode === 'palette' ? 'standard' : 'palette')}
          />
          <ToolButton
            icon={Dices}
            label="Couleur aléatoire"
            title={
              colorMode === 'palette'
                ? byFace
                  ? 'Nouvelles couleurs de faces au hasard : clique jusqu’à ce qu’elles te plaisent'
                  : 'Nouvelle série de couleurs au hasard : clique jusqu’à ce qu’elle te plaise'
                : `Active d’abord « ${byFace ? 'Couleurs par face' : 'Couleurs par pièce'} »`
            }
            disabled={!object || colorMode !== 'palette'}
            onClick={randomizePaletteColors}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Assemblage">
          <ToolButton
            icon={Maximize2}
            label="Éclater"
            title="Vue éclatée"
            active={explodeFactor > 0}
            disabled={!object}
            onClick={toggleExplode}
          />
          <CollisionButton />
          <ToolButton
            icon={Group}
            label="Grouper"
            title="Grouper la sélection"
            disabled={selectedNodeIds.length < 2}
            onClick={() => setShowGroupNamePrompt(true)}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Simulation">
          <ToolButton
            icon={Waves}
            label="Flux d'eau"
            active={flowPickMode}
            mode
            disabled={!object}
            onClick={() => {
              if (isMobile && !flowPickMode) pushToast('Touchez la pièce pour tracer le trajet du fluide')
              toggleFlowPickMode()
            }}
          />
          <AnimationAssistantToggle />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Impression">
          <ToolButton
            icon={Printer}
            label="Impression 3D"
            title="Réduire l'échelle et découper en tronçons pour l'imprimante 3D"
            active={printOpen}
            disabled={!object}
            onClick={() => setPrintOpen(!printOpen)}
          />
        </ToolGroup>
      </div>

      {/* Row 3 - options of whichever tools are active (only shown then) */}
      {hasContextStrip && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-light)] bg-black/10 px-4 py-2">
          {pipetteMode && (
            <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-sky-300">
              {/* Full colour picker: the swatch itself opens the system picker. */}
              <label
                title="Choisir une couleur"
                className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/50 shadow"
                style={{ backgroundColor: paintColor }}
              >
                <input
                  type="color"
                  value={paintColor}
                  onChange={(e) => setPaintColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <span className="flex items-center gap-1">
                {PAINT_COLORS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    title={label}
                    onClick={() => setPaintColor(value)}
                    className={`h-4 w-4 shrink-0 rounded-full border transition-transform hover:scale-125 ${
                      paintColor.toLowerCase() === value ? 'border-white ring-2 ring-sky-400' : 'border-white/30'
                    }`}
                    style={{ backgroundColor: value }}
                  />
                ))}
              </span>
              <span>
                {isMobile
                  ? 'Choisissez la couleur puis touchez les pièces à peindre'
                  : 'Choisissez la couleur puis cliquez sur les pièces à peindre (clic sur une pièce sélectionnée = toute la sélection)'}
              </span>
            </span>
          )}

          {manualDimMode && (
            <span className="flex shrink-0 items-center gap-2 text-xs text-sky-300">
              <span className="flex overflow-hidden rounded-md border border-sky-500/40">
                {(
                  [
                    ['length', 'Longueur'],
                    ['gap', 'Écart entre 2 arêtes'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setManualDimKind(kind)}
                    className={`px-2 py-0.5 ${manualDimKind === kind ? 'bg-sky-500 text-white' : 'hover:bg-sky-500/15'}`}
                  >
                    {label}
                  </button>
                ))}
              </span>
              {!isMobile &&
                (manualDimKind === 'length'
                  ? 'Cliquez sur une arête pour afficher sa cote (Échap pour quitter)'
                  : measurePendingPoint
                    ? 'Cliquez sur la deuxième arête'
                    : 'Cliquez sur la première arête (Échap pour quitter)')}
            </span>
          )}

          {measureMode && !manualDimMode && !isMobile && (
            <span className="shrink-0 text-xs text-sky-300">Cliquez sur une pièce pour placer un point de mesure</span>
          )}

          {annotationMode && !isMobile && (
            <span className="shrink-0 text-xs text-sky-300">Cliquez sur une pièce pour placer une annotation</span>
          )}

          {boxSelectMode && !isMobile && (
            <span className="shrink-0 text-xs text-sky-300">
              Glissez pour sélectionner les pièces dans le rectangle
            </span>
          )}

          {showExplodeSlider && <ExplodeControls />}

          <CollisionOptions />

          {flowPickMode && flowPassageCandidates.length > 0 && !isMobile && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
              Passage détecté : ⌀{flowPassageCandidates[flowPassageIndex].diameter.toFixed(1)}mm, longueur{' '}
              {flowPassageCandidates[flowPassageIndex].length.toFixed(1)}mm — Entrée par le haut ?
              <button
                onClick={() => applyFlowPassage(false)}
                className="rounded bg-sky-500 px-1.5 py-0.5 font-medium text-white hover:bg-sky-400"
              >
                Utiliser
              </button>
              <button
                onClick={() => applyFlowPassage(true)}
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
        </div>
      )}
    </header>
  )
}
