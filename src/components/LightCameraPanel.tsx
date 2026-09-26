import { useEffect, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Camera, Crosshair, Lightbulb, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { collectMeshes, findNodeById } from '../utils/componentTree'
import { LIGHTING_PRESETS, directionFromAngles, themeLighting } from '../utils/lighting'
import type { CameraState } from '../types/model'

// "Lumières et caméra" (toolbar, Affichage group): a floating panel over the
// 3D view with two tabs.
// - Lumières: presets, then the main light's strength/direction/colour, the
//   fill and ambient light, and "lampe frontale" (the light turns with the
//   camera). Edits the store's `lighting`, applied by Viewer3D's Scene.
// - Caméra: orbit angles, distance and angle of view as sliders, exact
//   camera/target coordinates, re-centring, and remembered views. It reads
//   the live camera through the same getCameraState/applyCameraState bridges
//   the .pindi save uses, polled while the tab is shown so the sliders follow
//   mouse orbiting too.

type Vec3 = [number, number, number]

interface Orbit {
  azimuth: number
  elevation: number
  distance: number
}

function orbitOf(state: CameraState): Orbit {
  const rel = new THREE.Vector3(...state.position).sub(new THREE.Vector3(...state.target))
  const distance = rel.length() || 1
  return {
    azimuth: THREE.MathUtils.radToDeg(Math.atan2(rel.x, rel.z)),
    elevation: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(rel.y / distance, -1, 1))),
    distance,
  }
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  title,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  title?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs" title={title}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full accent-[var(--bg-active)]"
      />
      <span className="text-right tabular-nums text-[var(--text-secondary)]">
        {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
        {unit}
      </span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">{title}</p>
      {children}
    </div>
  )
}

const SMALL_BUTTON =
  'flex items-center justify-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30'

const LIGHT_TINTS = [
  { value: '#ffd8a8', label: 'Chaude' },
  { value: '#ffffff', label: 'Neutre' },
  { value: '#d6e4ff', label: 'Froide' },
]

function LightsTab() {
  const lighting = useModelStore((s) => s.lighting)
  const theme = useModelStore((s) => s.theme)
  const setLighting = useModelStore((s) => s.setLighting)
  const applyLightingPreset = useModelStore((s) => s.applyLightingPreset)
  const realistic = useModelStore((s) => s.displayMode === 'realistic')
  const current = lighting ?? themeLighting(theme, realistic)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LIGHTING_PRESETS.map(({ id, label, title }) => (
          <button
            key={id}
            title={title}
            onClick={() => applyLightingPreset(id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              current.preset === id ? 'bg-[var(--bg-active)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
        {current.preset === 'custom' && (
          <span className="rounded-md border border-dashed border-white/20 px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            Personnalisé
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]" title="La lumière tourne avec la caméra : la face que vous regardez reste éclairée">
        <input
          type="checkbox"
          checked={current.followCamera}
          onChange={(e) => setLighting({ followCamera: e.target.checked })}
          className="h-3.5 w-3.5 accent-sky-500"
        />
        Lampe frontale (la lumière suit la caméra)
      </label>

      <Section title="Lumière principale">
        <Slider label="Intensité" value={current.keyIntensity} min={0} max={3} step={0.05} unit="" onChange={(v) => setLighting({ keyIntensity: v })} />
        <Slider
          label={current.followCamera ? 'Gauche / droite' : 'Tourner autour'}
          title={current.followCamera ? '0° = depuis votre œil' : '0° = de face, 90° = de droite, 180° = de derrière'}
          value={current.keyAzimuth}
          min={-180}
          max={180}
          step={1}
          unit="°"
          onChange={(v) => setLighting({ keyAzimuth: v })}
        />
        <Slider
          label="Hauteur"
          title="90° = lumière zénithale, 0° = rasante, négatif = par en dessous"
          value={current.keyElevation}
          min={-30}
          max={90}
          step={1}
          unit="°"
          onChange={(v) => setLighting({ keyElevation: v })}
        />
        <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
          <span className="text-[var(--text-secondary)]">Teinte</span>
          <span className="flex items-center gap-1.5">
            {LIGHT_TINTS.map(({ value, label }) => (
              <button
                key={value}
                title={label}
                onClick={() => setLighting({ keyColor: value })}
                className={`h-5 w-5 rounded-full border ${
                  current.keyColor.toLowerCase() === value ? 'border-white ring-2 ring-sky-400' : 'border-white/30'
                }`}
                style={{ backgroundColor: value }}
              />
            ))}
            <label title="Autre teinte" className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-white/30" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
              <input
                type="color"
                value={current.keyColor}
                onChange={(e) => setLighting({ keyColor: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </span>
        </div>
      </Section>

      <Section title="Lumières d'ambiance">
        <Slider
          label="Appoint"
          title="Lumière douce du côté opposé : éclaircit les zones d'ombre"
          value={current.fillIntensity}
          min={0}
          max={1.5}
          step={0.05}
          unit=""
          onChange={(v) => setLighting({ fillIntensity: v })}
        />
        <Slider
          label="Ambiante"
          title="Lumière égale partout, sans direction"
          value={current.ambient}
          min={0}
          max={1.5}
          step={0.05}
          unit=""
          onChange={(v) => setLighting({ ambient: v })}
        />
      </Section>

      <button className={`${SMALL_BUTTON} w-full`} onClick={() => applyLightingPreset('theme')}>
        <RotateCcw size={13} />
        Revenir à l'éclairage par défaut
      </button>
    </div>
  )
}

function CoordinateRow({ label, value, onCommit }: { label: string; value: Vec3; onCommit: (value: Vec3) => void }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr] items-center gap-1.5 text-xs">
      <span className="text-[var(--text-secondary)]">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <input
          // Re-mounts when the live value moves, so the field follows orbiting;
          // while typing the value is free until Entrée / leaving the field.
          key={`${axis}${value[i].toFixed(1)}`}
          defaultValue={value[i].toFixed(1)}
          inputMode="decimal"
          title={`${label} ${axis} (mm), validez avec Entrée`}
          aria-label={`${label} ${axis}`}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(',', '.'))
            if (Number.isFinite(n) && Math.abs(n - value[i]) > 1e-6) {
              const next = [...value] as Vec3
              next[i] = n
              onCommit(next)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="w-full rounded bg-[var(--bg-hover)] px-1.5 py-1 text-right tabular-nums text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--bg-active)]"
        />
      ))}
    </div>
  )
}

function CameraTab() {
  const getCameraState = useModelStore((s) => s.getCameraState)
  const applyCameraState = useModelStore((s) => s.applyCameraState)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const cameraFov = useModelStore((s) => s.cameraFov)
  const setCameraFov = useModelStore((s) => s.setCameraFov)
  const savedViews = useModelStore((s) => s.savedViews)
  const saveCurrentView = useModelStore((s) => s.saveCurrentView)
  const removeSavedView = useModelStore((s) => s.removeSavedView)
  const goToSavedView = useModelStore((s) => s.goToSavedView)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const tree = useModelStore((s) => s.tree)
  const [state, setState] = useState<CameraState | null>(() => getCameraState?.() ?? null)
  const [viewName, setViewName] = useState('')

  // Follow the live camera (mouse orbit, VUES buttons...) while shown.
  useEffect(() => {
    if (!getCameraState) return
    const id = window.setInterval(() => setState(getCameraState()), 200)
    return () => window.clearInterval(id)
  }, [getCameraState])

  if (!state || !applyCameraState) {
    return <p className="text-xs text-[var(--text-secondary)]">Ouvrez une pièce pour régler la caméra.</p>
  }

  const orbit = orbitOf(state)
  const radius = boundingBox ? boundingBox.getBoundingSphere(new THREE.Sphere()).radius : orbit.distance / 3
  const apply = (next: CameraState) => {
    applyCameraState(next)
    setState(next)
  }
  const setOrbit = (patch: Partial<Orbit>) => {
    const o = { ...orbit, ...patch }
    // Kept off the poles: straight above/below, "tourner autour" loses its meaning.
    const elevation = THREE.MathUtils.clamp(o.elevation, -89, 89)
    const position = directionFromAngles(o.azimuth, elevation)
      .multiplyScalar(o.distance)
      .add(new THREE.Vector3(...state.target))
    apply({ ...state, position: position.toArray() as Vec3, up: [0, 1, 0] })
  }
  // Moves the target to `center`, the camera along with it (same angle, same distance).
  const recenter = (center: THREE.Vector3) => {
    const delta = center.clone().sub(new THREE.Vector3(...state.target))
    apply({
      ...state,
      target: center.toArray() as Vec3,
      position: new THREE.Vector3(...state.position).add(delta).toArray() as Vec3,
    })
  }
  const selectionCenter = () => {
    if (!tree) return null
    const box = new THREE.Box3()
    for (const id of selectedNodeIds) {
      const node = findNodeById(tree, id)
      if (node) for (const mesh of collectMeshes(node)) box.expandByObject(mesh)
    }
    return box.isEmpty() ? null : box.getCenter(new THREE.Vector3())
  }

  return (
    <div className="space-y-3">
      <Section title="Position autour de la pièce">
        <Slider label="Tourner autour" title="0° = de face, 90° = de droite" value={orbit.azimuth} min={-180} max={180} step={1} unit="°" onChange={(v) => setOrbit({ azimuth: v })} />
        <Slider label="Hauteur" title="90° = vu de dessus, 0° = à hauteur de pièce" value={orbit.elevation} min={-89} max={89} step={1} unit="°" onChange={(v) => setOrbit({ elevation: v })} />
        <Slider
          label="Distance (mm)"
          title="Distance entre la caméra et le point visé (mm)"
          value={orbit.distance}
          min={Math.max(radius * 0.3, 0.1)}
          max={Math.max(radius * 12, orbit.distance)}
          step={Math.max(radius / 100, 0.01)}
          unit=""
          onChange={(v) => setOrbit({ distance: v })}
        />
        <Slider
          label="Angle de vue"
          title="Petit angle = presque sans perspective (vue de plan) ; grand angle = perspective marquée"
          value={cameraFov}
          min={10}
          max={90}
          step={1}
          unit="°"
          onChange={setCameraFov}
        />
      </Section>

      <Section title="Coordonnées exactes (mm)">
        <CoordinateRow label="Caméra" value={state.position} onCommit={(position) => apply({ ...state, position })} />
        <CoordinateRow label="Cible" value={state.target} onCommit={(target) => apply({ ...state, target })} />
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={SMALL_BUTTON}
            disabled={!boundingBox}
            title="Viser le centre de la pièce, sans changer l'angle ni la distance"
            onClick={() => boundingBox && recenter(boundingBox.getCenter(new THREE.Vector3()))}
          >
            <Crosshair size={13} />
            Viser la pièce
          </button>
          <button
            className={SMALL_BUTTON}
            disabled={selectedNodeIds.length === 0}
            title="Viser le centre des pièces sélectionnées"
            onClick={() => {
              const center = selectionCenter()
              if (center) recenter(center)
            }}
          >
            <Crosshair size={13} />
            Viser la sélection
          </button>
        </div>
      </Section>

      <Section title="Vues mémorisées">
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            saveCurrentView(viewName.trim() || `Vue ${savedViews.length + 1}`)
            setViewName('')
          }}
        >
          <input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder={`Vue ${savedViews.length + 1}`}
            aria-label="Nom de la vue"
            className="min-w-0 flex-1 rounded bg-[var(--bg-hover)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--bg-active)]"
          />
          <button type="submit" className={SMALL_BUTTON} title="Mémoriser la position actuelle de la caméra (enregistrée dans le .pindi)">
            <Save size={13} />
            Mémoriser
          </button>
        </form>
        {savedViews.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">Aucune vue mémorisée pour cette pièce.</p>
        ) : (
          <ul className="space-y-1">
            {savedViews.map((view) => (
              <li key={view.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => goToSavedView(view.id)}
                  className="min-w-0 flex-1 truncate rounded bg-[var(--bg-hover)] px-2 py-1 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-active)] hover:text-white"
                  title="Revenir à cette vue"
                >
                  {view.name}
                </button>
                <button
                  onClick={() => removeSavedView(view.id)}
                  title="Oublier cette vue"
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/20 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

export function LightCameraPanel() {
  const open = useModelStore((s) => s.lightCameraOpen)
  const setOpen = useModelStore((s) => s.setLightCameraOpen)
  const object = useModelStore((s) => s.object)
  const [tab, setTab] = useState<'lights' | 'camera'>('lights')

  if (!open || !object) return null

  return (
    <div className="absolute top-3 right-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[20rem] max-w-[calc(100%-1.5rem)] flex-col rounded-xl border border-[var(--border-light)] bg-[var(--bg-panel)]/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-1 border-b border-[var(--border-light)] p-1.5">
        {(
          [
            ['lights', 'Lumières', Lightbulb],
            ['camera', 'Caméra', Camera],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === id ? 'bg-[var(--bg-active)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        <button onClick={() => setOpen(false)} title="Fermer" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <X size={14} />
        </button>
      </div>
      <div className="overflow-y-auto p-3">{tab === 'lights' ? <LightsTab /> : <CameraTab />}</div>
    </div>
  )
}
