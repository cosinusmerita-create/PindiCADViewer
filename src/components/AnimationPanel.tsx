import { useMemo, useState, type ReactNode } from 'react'
import {
  MoveHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Square,
  Undo2,
} from 'lucide-react'
import { useModelStore, DEFAULT_NODE_ANIMATION } from '../hooks/useModelState'
import { findNodeById } from '../utils/componentTree'
import { encodeSelectionKey } from '../utils/selectionKey'
import type { RotationAxes, TimedAnimationMode } from '../types/model'

type AxisId = 'x' | 'y' | 'z'
const AXES: AxisId[] = ['x', 'y', 'z']

function AxisButtons({
  value,
  onSelect,
}: {
  value: RotationAxes | AxisId
  onSelect: (axis: AxisId, enabled: boolean) => void
}) {
  const multiple = typeof value !== 'string'
  return (
    <div className="flex items-center gap-1">
      {AXES.map((axis) => {
        const active = multiple ? value[axis] : value === axis
        return (
          <button
            key={axis}
            onClick={() => onSelect(axis, multiple ? !value[axis] : true)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold uppercase transition-colors ${
              active ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {axis}
          </button>
        )
      })}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">{children}</p>
}

function DurationSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500">
      <span className="shrink-0">Durée</span>
      <input
        type="range"
        min={0.5}
        max={10}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full accent-sky-500"
      />
      <span className="w-8 shrink-0 text-right">{value.toFixed(1)}s</span>
    </label>
  )
}

export function AnimationPanel() {
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const key = useMemo(() => encodeSelectionKey(selectedNodeIds), [selectedNodeIds])
  const tree = useModelStore((s) => s.tree)
  const anim = useModelStore((s) => (key ? s.animations[key] : undefined)) ?? DEFAULT_NODE_ANIMATION
  const animationsPaused = useModelStore((s) => s.animationsPaused)

  const setContinuousRotationAxis = useModelStore((s) => s.setContinuousRotationAxis)
  const setContinuousRotationSpeed = useModelStore((s) => s.setContinuousRotationSpeed)
  const setContinuousRotationDirection = useModelStore((s) => s.setContinuousRotationDirection)
  const setContinuousRotationActive = useModelStore((s) => s.setContinuousRotationActive)
  const startPresentation = useModelStore((s) => s.startPresentation)
  const startTimedAnimation = useModelStore((s) => s.startTimedAnimation)
  const setAnimationsPaused = useModelStore((s) => s.setAnimationsPaused)
  const requestNodeReset = useModelStore((s) => s.requestNodeReset)
  const requestResetAll = useModelStore((s) => s.requestResetAll)

  const [preciseAxis, setPreciseAxis] = useState<AxisId>('y')
  const [preciseAngle, setPreciseAngle] = useState(90)
  const [preciseDuration, setPreciseDuration] = useState(2)

  const [translateAxis, setTranslateAxis] = useState<AxisId>('x')
  const [translateDistance, setTranslateDistance] = useState(50)
  const [translateDuration, setTranslateDuration] = useState(2)
  const [translateMode, setTranslateMode] = useState<TimedAnimationMode>('once')

  const [presentationSpeed, setPresentationSpeed] = useState(0.15)
  const [collapsed, setCollapsed] = useState(false)

  if (selectedNodeIds.length === 0) return null

  const node = tree && selectedNodeIds.length === 1 ? findNodeById(tree, selectedNodeIds[0]) : null
  const selectionLabel = node ? node.name : `${selectedNodeIds.length} pièces sélectionnées`
  const isPresentation =
    anim.continuousRotation.active &&
    anim.continuousRotation.axes.y &&
    !anim.continuousRotation.axes.x &&
    !anim.continuousRotation.axes.z

  if (collapsed) {
    return (
      <div className="flex shrink-0 items-start border-l border-[var(--border-light)] bg-[var(--bg-panel)]">
        <button
          title="Afficher le panneau d'animation"
          onClick={() => setCollapsed(false)}
          className="p-2 text-slate-500 hover:text-slate-200"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
    )
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border-light)] bg-[var(--bg-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Play size={12} /> Animation
        </span>
        <button
          title="Masquer le panneau d'animation"
          onClick={() => setCollapsed(true)}
          className="text-slate-500 hover:text-slate-200"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <p className="truncate text-xs text-slate-400">{selectionLabel}</p>

        {/* 1. Rotation continue */}
        <div>
          <SectionLabel>Rotation continue</SectionLabel>
          <div className="space-y-2 rounded-lg bg-white/5 p-2.5">
            <AxisButtons
              value={anim.continuousRotation.axes}
              onSelect={(axis, enabled) => setContinuousRotationAxis(key, axis, enabled)}
            />

            <label className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="shrink-0">Vitesse</span>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={anim.continuousRotation.speed}
                onChange={(e) => setContinuousRotationSpeed(key, Number(e.target.value))}
                className="h-1 w-full accent-sky-500"
              />
              <span className="w-10 shrink-0 text-right">{anim.continuousRotation.speed.toFixed(1)} t/s</span>
            </label>

            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-md bg-white/5">
                <button
                  title="Sens anti-horaire"
                  onClick={() => setContinuousRotationDirection(key, -1)}
                  className={`flex items-center justify-center p-1.5 transition-colors ${
                    anim.continuousRotation.direction === -1
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  title="Sens horaire"
                  onClick={() => setContinuousRotationDirection(key, 1)}
                  className={`flex items-center justify-center p-1.5 transition-colors ${
                    anim.continuousRotation.direction === 1
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <RotateCw size={14} />
                </button>
              </div>

              <button
                onClick={() => setContinuousRotationActive(key, !anim.continuousRotation.active)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  anim.continuousRotation.active
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {anim.continuousRotation.active ? <Pause size={13} /> : <Play size={13} />}
                {anim.continuousRotation.active ? 'Arrêter' : 'Démarrer'}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Rotation par angle précis */}
        <div>
          <SectionLabel>Rotation précise</SectionLabel>
          <div className="space-y-2 rounded-lg bg-white/5 p-2.5">
            <div className="flex items-center justify-between">
              <AxisButtons value={preciseAxis} onSelect={(axis) => setPreciseAxis(axis)} />
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="number"
                  value={preciseAngle}
                  onChange={(e) => setPreciseAngle(Number(e.target.value))}
                  className="w-16 rounded border border-[var(--border-light)] bg-[#0f0f1e] px-1.5 py-1 text-right text-xs text-slate-200"
                />
                °
              </label>
            </div>
            <DurationSlider value={preciseDuration} onChange={setPreciseDuration} />
            <button
              onClick={() =>
                startTimedAnimation(key, {
                  kind: 'rotation',
                  axis: preciseAxis,
                  mode: 'once',
                  targetValue: preciseAngle,
                  duration: preciseDuration,
                })
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400"
            >
              <RefreshCw size={13} /> Tourner
            </button>
          </div>
        </div>

        {/* 3. Translation */}
        <div>
          <SectionLabel>Translation</SectionLabel>
          <div className="space-y-2 rounded-lg bg-white/5 p-2.5">
            <div className="flex items-center justify-between">
              <AxisButtons value={translateAxis} onSelect={(axis) => setTranslateAxis(axis)} />
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="number"
                  value={translateDistance}
                  onChange={(e) => setTranslateDistance(Number(e.target.value))}
                  className="w-16 rounded border border-[var(--border-light)] bg-[#0f0f1e] px-1.5 py-1 text-right text-xs text-slate-200"
                />
                mm
              </label>
            </div>
            <DurationSlider value={translateDuration} onChange={setTranslateDuration} />
            <div className="flex items-center overflow-hidden rounded-md bg-white/5 text-xs">
              <button
                onClick={() => setTranslateMode('once')}
                className={`flex-1 px-2 py-1 font-medium transition-colors ${
                  translateMode === 'once' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Aller simple
              </button>
              <button
                onClick={() => setTranslateMode('yoyo')}
                className={`flex-1 px-2 py-1 font-medium transition-colors ${
                  translateMode === 'yoyo' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Yoyo
              </button>
            </div>
            <button
              onClick={() =>
                startTimedAnimation(key, {
                  kind: 'translation',
                  axis: translateAxis,
                  mode: translateMode,
                  targetValue: translateDistance,
                  duration: translateDuration,
                })
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400"
            >
              <MoveHorizontal size={13} /> Déplacer
            </button>
          </div>
        </div>

        {/* 4. Mode présentation */}
        <div>
          <SectionLabel>Présentation</SectionLabel>
          <div className="space-y-2 rounded-lg bg-white/5 p-2.5">
            <label className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="shrink-0">Vitesse</span>
              <input
                type="range"
                min={0.05}
                max={2}
                step={0.05}
                value={presentationSpeed}
                onChange={(e) => setPresentationSpeed(Number(e.target.value))}
                className="h-1 w-full accent-sky-500"
              />
              <span className="w-10 shrink-0 text-right">{presentationSpeed.toFixed(2)} t/s</span>
            </label>
            <button
              onClick={() => startPresentation(key, presentationSpeed)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                isPresentation ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isPresentation ? <Pause size={13} /> : <Play size={13} />} Présentation (plateau tournant)
            </button>
          </div>
        </div>

        {/* 5. Contrôles globaux */}
        <div>
          <SectionLabel>Contrôles globaux</SectionLabel>
          <div className="space-y-1.5">
            <button
              onClick={() => setAnimationsPaused(!animationsPaused)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-white/5 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
            >
              {animationsPaused ? <Play size={13} /> : <Pause size={13} />}
              {animationsPaused ? 'Reprendre tout' : 'Mettre en pause tout'}
            </button>
            <button
              onClick={() => requestResetAll()}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-white/5 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
            >
              <Square size={13} /> Stop &amp; Reset (tout)
            </button>
            <button
              onClick={() => requestNodeReset(key)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              <Undo2 size={13} /> {selectedNodeIds.length > 1 ? 'Réinitialiser la sélection' : 'Réinitialiser cette pièce'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
