import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, Eye, Printer, X } from 'lucide-react'
import type * as THREE from 'three'
import { useModelStore } from '../hooks/useModelState'
import { usePrintStore, type PrintAxis } from '../hooks/usePrintStore'
import { useToastStore } from '../hooks/useToastStore'
import { collectMeshes, findNodeById } from '../utils/componentTree'
import { sliceSoup } from '../utils/meshCut'
import {
  buildPiecesZip,
  buildPinFiles,
  buildPreview,
  collectWorldSoup,
  cutPlanes,
  fitsBed,
  longestAxis,
  pieceInfo,
  segmentCount,
  soupBounds,
  toPrintSpace,
} from '../utils/printSplit'

const AXES: PrintAxis[] = ['x', 'y', 'z']
const MAX_PIECES = 40

// Panneau « Impression 3D » : réduit la pièce à l'échelle puis la découpe en
// tronçons qui tiennent sur le plateau (port des modules « Prototype à l'échelle
// réduite » et « Export de fabrication » de Pindi Blade Profiler). Le modèle
// affiché n'est jamais modifié : l'échelle et la coupe ne s'appliquent qu'à
// l'export.
export function PrintPanel() {
  const st = usePrintStore()
  const tree = useModelStore((s) => s.tree)
  const object = useModelStore((s) => s.object)
  const fileName = useModelStore((s) => s.fileName)
  const selectedNodeIds = useModelStore((s) => s.selectedNodeIds)
  const visibility = useModelStore((s) => s.visibility)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const pushToast = useToastStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)
  // Incrémenté à chaque ouverture / clic sur « Actualiser » : les mailles
  // bougent (animation, éclatement) sans passer par le store.
  const [refresh, setRefresh] = useState(0)

  const { meshes, usingSelection } = useMemo(() => {
    void refresh
    if (!st.open || !tree || !object) return { meshes: [] as THREE.Mesh[], usingSelection: false }
    let list: THREE.Mesh[] = []
    for (const id of selectedNodeIds) {
      const node = findNodeById(tree, id)
      if (node) list.push(...collectMeshes(node))
    }
    const usingSel = list.length > 0
    if (!usingSel) list = collectMeshes(tree)
    return { meshes: [...new Set(list)].filter((m) => m.visible), usingSelection: usingSel }
    // visibility/explodeFactor : pas lus ici mais déplacent ou masquent des mailles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.open, tree, object, selectedNodeIds, visibility, explodeFactor, refresh])

  const { soup, bounds } = useMemo(() => {
    if (meshes.length === 0) return { soup: null, bounds: null }
    const s = collectWorldSoup(meshes)
    return { soup: s.length ? s : null, bounds: s.length ? soupBounds(s) : null }
  }, [meshes])

  const axis: PrintAxis = st.axis ?? (bounds ? longestAxis(bounds) : 'y')
  const scale = Math.max(0.001, st.scalePct / 100)
  const size = bounds
    ? ([bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]] as const)
    : ([0, 0, 0] as const)
  const axisIdx = AXES.indexOf(axis)
  const origH = size[axisIdx]
  const scaledH = origH * scale

  const n = segmentCount(scaledH, st.splitMode, st.segCount, st.maxSegHeight, MAX_PIECES)
  const dScale = useDeferredValue(scale)
  const dN = useDeferredValue(n)
  const dAxis = useDeferredValue(axis)

  const printSoup = useMemo(
    () => (soup && bounds ? toPrintSpace(soup, dAxis, dScale, bounds) : null),
    [soup, bounds, dAxis, dScale],
  )

  const preview = useMemo(() => {
    if (!printSoup || !bounds) return null
    const height = origH * dScale
    const planes = cutPlanes(height, dN)
    const { pieces } = sliceSoup(printSoup, planes, false)
    return pieces.map((p, i) => pieceInfo(p, i + 1))
    // origH suit `bounds`/`axis` déjà présents ci-dessus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printSoup, dN])

  // Plans de coupe dans la vue 3D.
  useEffect(() => {
    if (!st.open || !bounds || n < 2) {
      usePrintStore.getState().set({ planes: null })
      return
    }
    const i = AXES.indexOf(axis)
    const positions = cutPlanes(origH, n).map((z) => bounds.min[i] + z)
    const others = [0, 1, 2].filter((k) => k !== i)
    usePrintStore.getState().set({
      planes: {
        axis,
        positions,
        center: [
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2,
        ],
        size: [size[others[0]] * 1.15, size[others[1]] * 1.15],
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.open, bounds, axis, n, scale])

  // Aperçu éclaté : remplace le modèle par ses vrais tronçons (alvéoles
  // comprises) écartés le long de l'axe. Les pièces d'origine sont masquées le
  // temps de l'aperçu puis remontrées (même si le panneau se ferme).
  const previewActive = st.open && st.previewOn
  const jointActive = st.jointEnabled && usingSelection
  const previewBase = (fileName ?? 'piece').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')
  useEffect(() => {
    if (!previewActive || !printSoup || !bounds) {
      usePrintStore.getState().set({ preview: null })
      return
    }
    const timer = setTimeout(() => {
      const opts = { pins: st.jointPins, size: st.jointSize, clearance: st.jointClearance, depth: st.jointDepth, wall: 1.2 }
      const r = buildPreview(printSoup, cutPlanes(origH * dScale, dN), dAxis, dScale, bounds, st.previewGap, jointActive ? opts : null, previewBase)
      usePrintStore.getState().set({ preview: { stats: r.stats, pieces: r.pieces, pins: r.pins, joint: jointActive ? { pinCount: r.pinCount, shape: r.usedShape, misses: r.misses } : null }, planes: null })
    }, 200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewActive, printSoup, dN, st.previewGap, jointActive, st.jointPins, st.jointSize, st.jointClearance, st.jointDepth])

  useEffect(() => {
    if (!previewActive) return
    const hidden = meshes.filter((m) => m.visible)
    hidden.forEach((m) => (m.visible = false))
    return () => hidden.forEach((m) => (m.visible = true))
  }, [previewActive, meshes])

  if (!st.open) return null

  const bed = { x: st.bedX, y: st.bedY, z: st.bedZ }
  const allFit = preview ? preview.every((p) => fitsBed(p, bed)) : true
  const fitCount = Math.min(MAX_PIECES, Math.max(1, Math.ceil(scaledH / Math.max(1, st.bedZ) - 1e-9)))
  const fmt = (v: number) => (v < 100 ? v.toFixed(1) : v.toFixed(0))
  const others = [0, 1, 2].filter((k) => k !== axisIdx)
  const setSplit = st.set
  // L'emboîtement ne s'applique qu'aux pièces sélectionnées (celles exportées).
  const jointOn = st.jointEnabled && usingSelection
  const jointOptions = { pins: st.jointPins, size: st.jointSize, clearance: st.jointClearance, depth: st.jointDepth, wall: 1.2 }

  const saveBlob = (data: BlobPart, fileName: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  // Broches seules (à garder pour plus tard), en STL (maillage) ou STEP (CAO).
  const handlePinsExport = async (format: 'stl' | 'step') => {
    if (!printSoup) return
    setBusy(true)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const files = buildPinFiles(printSoup, cutPlanes(scaledH, n), jointOptions, previewBase)
      if (!files) {
        pushToast("Aucune broche : la section est trop mince pour l'emboîtement")
        return
      }
      if (format === 'stl') saveBlob(files.stl as BlobPart, `${files.name}.stl`, 'model/stl')
      else saveBlob(files.step, `${files.name}.step`, 'model/step')
      pushToast(`Broche ${files.shape.w} × ${files.shape.l} × ${files.length.toFixed(1)} mm exportée en ${format.toUpperCase()} — à imprimer en ${files.count} exemplaire(s)`)
    } catch (err) {
      console.error(err)
      pushToast("Échec de l'export des broches")
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (!printSoup || !bounds) return
    if (explodeFactor > 0 && !window.confirm("La vue éclatée est active : les tronçons seront exportés dans la position éclatée.\n\nExporter quand même ?")) return
    setBusy(true)
    // Laisse le temps à l'interface d'afficher « Calcul… » avant le calcul lourd.
    await new Promise((r) => setTimeout(r, 30))
    try {
      const base = (fileName ?? 'piece').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')
      const { zip, infos, openLoops, pinCount, jointMisses } = buildPiecesZip(printSoup, cutPlanes(scaledH, n), base, st.scalePct, axis, jointOn ? jointOptions : null)
      const blob = new Blob([zip as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base}_impression3D_${infos.length}troncons.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      const jointNote = jointOn ? (jointMisses > 0 ? ` — emboîtement incomplet sur ${jointMisses} plan(s), voir LISEZ-MOI` : ` + ${pinCount} broche(s)`) : ''
      pushToast(
        openLoops > 0
          ? `${infos.length} tronçon(s) exporté(s) — ${openLoops} contour(s) de coupe non fermé(s) (maillage non étanche)`
          : `${infos.length} tronçon(s) exporté(s) en STL${jointNote}`,
      )
    } catch (err) {
      console.error(err)
      pushToast("Échec de l'export des tronçons")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 w-[360px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-light)] bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-secondary)] 2xl:w-[580px] max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:w-auto">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Printer size={14} className="text-sky-300" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Impression 3D</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          {usingSelection ? 'Sélection' : 'Pièces visibles'} : {meshes.length} pièce{meshes.length > 1 ? 's' : ''}
        </span>
        <button onClick={() => setRefresh((r) => r + 1)} className="rounded bg-white/5 px-2 py-0.5 hover:text-[var(--text-primary)]">
          Actualiser
        </button>
        <button onClick={() => st.setOpen(false)} title="Fermer" className="ml-auto hover:text-[var(--text-primary)]">
          <X size={16} />
        </button>
      </div>

      {!soup || !bounds ? (
        <p className="py-2 text-slate-500">Ouvrez un modèle pour préparer l'impression.</p>
      ) : (
        <>
          {/* Réglages : 4 cartes de même largeur (2 x 2 sur écran étroit) */}
          <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
            <Card title="1. Échelle">
              <Field label="Échelle">
                <NumberInput
                  unit="%"
                  min={0.1}
                  max={1000}
                  step={1}
                  value={Number(st.scalePct.toFixed(2))}
                  onChange={(v) => v > 0 && st.set({ scalePct: v })}
                />
              </Field>
              <div className="flex gap-1">
                {[100, 50, 30, 25, 10].map((p) => (
                  <button
                    key={p}
                    onClick={() => st.set({ scalePct: p })}
                    className={`flex-1 rounded py-0.5 ${st.scalePct === p ? 'bg-[var(--bg-active)] text-white' : 'bg-white/5 hover:text-[var(--text-primary)]'}`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <Field label={`Hauteur cible (${axis.toUpperCase()})`}>
                <NumberInput
                  unit="mm"
                  min={1}
                  step={1}
                  value={Number(scaledH.toFixed(2))}
                  onChange={(v) => v > 0 && origH > 0 && st.set({ scalePct: (v / origH) * 100 })}
                />
              </Field>
              <Note>
                Original : {fmt(size[others[0]])} × {fmt(size[others[1]])} × {fmt(origH)} mm
                <br />
                Imprimé : <b className="text-[var(--text-primary)]">{fmt(size[others[0]] * scale)} × {fmt(size[others[1]] * scale)} × {fmt(scaledH)} mm</b>
              </Note>
            </Card>

            <Card title="2. Découpe en tronçons">
              <Field label="Axe de coupe">
                <div className="flex items-center gap-1">
                  {AXES.map((a) => (
                    <button
                      key={a}
                      onClick={() => st.set({ axis: a })}
                      className={`h-6 w-7 rounded text-xs font-semibold uppercase ${axis === a ? 'bg-[var(--bg-active)] text-white' : 'bg-white/5 hover:text-[var(--text-primary)]'}`}
                    >
                      {a}
                    </button>
                  ))}
                  <button
                    onClick={() => st.set({ axis: null })}
                    title="Axe le plus long du modèle"
                    className={`h-6 rounded px-1.5 text-[11px] ${st.axis === null ? 'bg-[var(--bg-active)] text-white' : 'bg-white/5 hover:text-[var(--text-primary)]'}`}
                  >
                    auto
                  </button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    ['count', 'Par nombre'],
                    ['height', 'Par hauteur max.'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSplit({ splitMode: k })}
                    className={`rounded py-1 ${st.splitMode === k ? 'bg-[var(--bg-active)] text-white' : 'bg-white/5 hover:text-[var(--text-primary)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {st.splitMode === 'count' ? (
                <>
                  <Field label="Tronçons">
                    <NumberInput
                      min={1}
                      max={MAX_PIECES}
                      step={1}
                      value={n}
                      onChange={(v) => setSplit({ segCount: Math.round(v) || 1 })}
                    />
                  </Field>
                  <button
                    onClick={() => setSplit({ splitMode: 'count', segCount: fitCount })}
                    className="w-full rounded bg-white/5 py-1 hover:text-[var(--text-primary)]"
                  >
                    ↧ Tenir dans la hauteur du plateau ({fitCount})
                  </button>
                </>
              ) : (
                <Field label="Hauteur max.">
                  <NumberInput
                    unit="mm"
                    min={1}
                    step={1}
                    value={st.maxSegHeight}
                    onChange={(v) => setSplit({ maxSegHeight: Math.max(1, v || 1) })}
                  />
                </Field>
              )}
              <Note>{n === 1 ? 'Pas de découpe (1 seul tronçon).' : `${n} tronçons de ${fmt(scaledH / n)} mm de haut.`}</Note>
            </Card>

            <Card title="3. Plateau de l'imprimante">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['bedX', 'X (largeur)'],
                    ['bedY', 'Y (profondeur)'],
                    ['bedZ', 'Z (hauteur)'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-0.5 text-[11px]">
                    {label}
                    <NumberInput
                      min={20}
                      max={2000}
                      value={st[key]}
                      onChange={(v) => v > 0 && setSplit({ [key]: Math.min(2000, Math.max(20, v)) })}
                    />
                  </label>
                ))}
              </div>
              <Note>Valeurs en mm. Défaut : 256 × 256 × 256 (Bambu Lab A1).</Note>
            </Card>

            <Card title="4. Emboîtement (broches)">
              <label className={`flex items-center gap-1.5 ${usingSelection ? '' : 'opacity-50'}`}>
                <input
                  type="checkbox"
                  disabled={!usingSelection}
                  checked={jointOn}
                  onChange={(e) => setSplit({ jointEnabled: e.target.checked })}
                  className="accent-sky-500"
                />
                Alvéoles + broches d'assemblage
              </label>
              {!usingSelection && (
                <p className="text-[11px] text-amber-400">Sélectionnez la ou les pièces à emboîter (ex. la pale) : l'option ne s'applique qu'à elles.</p>
              )}
              {jointOn && (
                <>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    {(
                      [
                        ['jointPins', 'Broches / jonction', 1, 3, 1],
                        ['jointSize', 'Côté broche (mm)', 1, 20, 0.5],
                        ['jointClearance', 'Jeu / côté (mm)', 0, 1, 0.05],
                        ['jointDepth', 'Profondeur (mm)', 3, 40, 1],
                      ] as const
                    ).map(([key, label, min, max, step]) => (
                      <label key={key} className="flex flex-col gap-0.5 text-[11px]">
                        {label}
                        <NumberInput
                          min={min}
                          max={max}
                          step={step}
                          value={st[key]}
                          onChange={(v) => !Number.isNaN(v) && setSplit({ [key]: Math.min(max, Math.max(min, key === 'jointPins' ? Math.round(v) : v)) })}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]">1 broche</span>
                    {(['stl', 'step'] as const).map((f) => (
                      <button
                        key={f}
                        disabled={busy || !printSoup}
                        onClick={() => handlePinsExport(f)}
                        className="flex flex-1 items-center justify-center gap-1 rounded bg-white/5 py-1 font-medium uppercase hover:text-[var(--text-primary)] disabled:opacity-40"
                      >
                        <Download size={12} /> {f}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Résultat : tableau des tronçons à gauche, actions à droite */}
          <div className="mt-2.5 grid grid-cols-1 gap-2.5">
            <Card title="5. Aperçu des tronçons (L × l × H, mm)" className="">
              <div className="max-h-32 overflow-y-auto rounded border border-[var(--border-light)]">
                {preview?.map((p) => {
                  const ok = fitsBed(p, bed)
                  const selected = st.previewOn && st.previewSelected === p.index - 1
                  return (
                    <div
                      key={p.index}
                      onClick={() => st.previewOn && setSplit({ previewSelected: selected ? null : p.index - 1 })}
                      className={`grid grid-cols-[1fr_auto_5.5rem] items-center gap-3 border-b border-white/5 px-2 py-1 last:border-b-0 ${st.previewOn ? 'cursor-pointer hover:bg-white/5' : ''} ${selected ? 'bg-amber-500/15' : ''}`}
                    >
                      <span>
                        Tronçon {p.index}/{preview.length}
                      </span>
                      <span className="font-mono text-[var(--text-primary)]">
                        {fmt(p.w)} × {fmt(p.d)} × {fmt(p.h)}
                      </span>
                      <span className={`text-right font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? '✓ tient' : '✗ trop grand'}</span>
                    </div>
                  )
                })}
              </div>
              {!allFit && (
                <p className="text-[11px] text-red-400">
                  Un tronçon dépasse le plateau : augmentez le nombre de tronçons (si c'est la hauteur), ou réduisez l'échelle (si c'est la largeur).
                </p>
              )}
            </Card>

            <Card title="Aperçu et export" className="">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSplit({ previewOn: !st.previewOn })}
                  disabled={!printSoup}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium disabled:opacity-40 ${st.previewOn ? 'bg-amber-500 text-slate-900' : 'bg-white/5 hover:text-[var(--text-primary)]'}`}
                >
                  <Eye size={14} /> {st.previewOn ? "Quitter l'aperçu" : 'Aperçu éclaté'}
                </button>
                {st.previewOn && (
                  <label className="flex flex-1 items-center gap-1.5">
                    Écart
                    <input
                      type="range"
                      min={0}
                      max={150}
                      step={5}
                      value={st.previewGap}
                      onChange={(e) => setSplit({ previewGap: Number(e.target.value) })}
                      className="h-1 flex-1 accent-amber-500"
                    />
                    <span className="w-9 text-right">{st.previewGap}%</span>
                  </label>
                )}
              </div>
              {st.preview?.joint && (
                <p className={`text-[11px] ${st.preview.joint.pinCount === 0 || st.preview.joint.misses > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {st.preview.joint.pinCount === 0
                    ? "Emboîtement impossible : la section est trop mince (ou les tronçons trop courts) pour une alvéole. Réduisez le nombre de tronçons ou l'épaisseur de paroi demandée."
                    : `Emboîtement : ${st.preview.joint.pinCount} broche(s) de ${st.preview.joint.shape?.w} × ${st.preview.joint.shape?.l} mm${st.preview.joint.shape && st.preview.joint.shape.w < st.jointSize ? ` (réduite : section mince, alvéole allongée dans le sens de la corde)` : ''}${st.preview.joint.misses > 0 ? ' — incomplet sur certains plans' : ''}.${st.preview.joint.shape && st.preview.joint.shape.w < 3 ? ' Broche très fine : la pièce est trop mince à cette échelle, imprimez à plus grande échelle pour un emboîtement solide.' : ''}`}
                </p>
              )}
              {explodeFactor > 0 && (
                <p className="text-[11px] text-amber-400">La vue éclatée est active : l'export suit les positions actuelles.</p>
              )}
              <button
                onClick={handleExport}
                disabled={busy || !printSoup}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 font-medium text-white hover:bg-sky-400 disabled:opacity-40"
              >
                <Download size={14} /> {busy ? 'Calcul…' : `Exporter ${n} tronçon${n > 1 ? 's' : ''} (STL, zip)`}
              </button>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// Carte de réglages : titre + contenu espacé, même look pour toutes les sections.
function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-1.5 rounded-lg border border-[var(--border-light)] bg-black/10 p-2.5 ${className}`}>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</h3>
      {children}
    </section>
  )
}

// Ligne « libellé à gauche, contrôle à droite » : les champs s'alignent d'une carte à l'autre.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step,
}: {
  value: number
  onChange: (v: number) => void
  unit?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-[4.5rem] rounded border border-[var(--border-light)] bg-[var(--bg-input)] px-1.5 py-0.5 text-right text-xs text-slate-200"
      />
      {unit && <span className="w-6 text-[11px] text-[var(--text-muted)]">{unit}</span>}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-[var(--text-muted)]">{children}</p>
}
