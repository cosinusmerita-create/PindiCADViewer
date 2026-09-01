import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ClipboardList, Copy, PanelRightClose, PanelRightOpen, Printer } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { collectPartNodeIds, findNodeById } from '../utils/componentTree'
import type { DimensionReport } from '../types/model'

function formatMm(value: number) {
  return `${value.toFixed(2)} mm`
}

function formatMm1(value: number) {
  return value.toFixed(1)
}

function formatDeg(radians: number) {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`
}

// Height rows get capped for a busy, multi-part assembly (where "distinct
// horizontal levels across every unrelated part" can run to a dozen rows
// and stops being meaningful the way it is for one part's actual steps) -
// past that, only the overall total is shown.
function visibleHeightRows(report: DimensionReport) {
  return report.heights.length > 7 ? report.heights.filter((h) => h.label === 'Total') : report.heights
}

function diameterRows(report: DimensionReport) {
  return report.diameterGroups.map((group, i) => {
    const tag = i === report.largestGroupIndex ? ' ext. max' : i === report.centralBoreGroupIndex ? ' alésage' : ''
    const suffix = group.count > 1 ? ` (perçages)` : ''
    const label = tag ? `⌀${tag}` : group.count > 1 ? `${group.count}× ⌀` : '⌀'
    return { label, value: `${formatMm(group.radius * 2)}${suffix}` }
  })
}

function buildPlainTextReport(report: DimensionReport, targetLabel: string): string {
  const lines: string[] = []
  lines.push('FICHE DIMENSIONNELLE')
  lines.push(`${targetLabel} : ${report.name}`)
  lines.push('')
  lines.push('ENCOMBREMENT')
  lines.push(`L x l x H : ${formatMm1(report.size.x)} x ${formatMm1(report.size.z)} x ${formatMm1(report.size.y)} mm`)
  lines.push('')
  if (report.diameterGroups.length > 0) {
    lines.push('DIAMÈTRES')
    for (const row of diameterRows(report)) lines.push(`${row.label} : ${row.value}`)
    if (report.pitchCircle) {
      const angle = report.pitchCircle.angleStep ? ` (tous les ${formatDeg(report.pitchCircle.angleStep)})` : ''
      lines.push(`Entraxe : ⌀ ${formatMm(report.pitchCircle.diameter)}${angle}`)
    }
    lines.push('')
  }
  const heights = visibleHeightRows(report)
  if (heights.length > 0) {
    lines.push('ÉPAISSEURS')
    for (const h of heights) lines.push(`${h.label} : ${formatMm(h.value)}`)
    lines.push('')
  }
  if (report.topSegments.length > 0) {
    lines.push('LONGUEURS PRINCIPALES')
    for (const s of report.topSegments) lines.push(`- ${formatMm(s.length)}`)
    lines.push('')
  }
  lines.push('PROPRIÉTÉS')
  lines.push(`Volume : ${(report.volumeMm3 / 1000).toFixed(1)} cm³`)
  lines.push(`Surface : ${(report.surfaceMm2 / 100).toFixed(1)} cm²`)
  lines.push(`Triangles : ${report.triangleCount.toLocaleString('fr-FR')}`)
  return lines.join('\n')
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-200">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-400 first:mt-0">{children}</p>
}

export function DimensionSheetPanel() {
  const showAutoDimensions = useModelStore((s) => s.showAutoDimensions)
  const report = useModelStore((s) => s.dimensionReport)
  const fileName = useModelStore((s) => s.fileName)
  const tree = useModelStore((s) => s.tree)
  const dimensionTargetNodeId = useModelStore((s) => s.dimensionTargetNodeId)
  const setDimensionTargetNodeId = useModelStore((s) => s.setDimensionTargetNodeId)

  const [collapsed, setCollapsed] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)

  const parts = useMemo(() => {
    if (!tree) return []
    return collectPartNodeIds(tree).map((id) => ({ id, name: findNodeById(tree, id)?.name ?? id }))
  }, [tree])

  if (!showAutoDimensions || !report) return null

  const targetLabel = dimensionTargetNodeId ? 'Pièce' : 'Fichier'
  const targetName = dimensionTargetNodeId ? report.name : (fileName ?? report.name)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextReport(report, targetLabel))
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 1500)
    } catch {
      // Clipboard access can be denied by the browser/permissions - nothing
      // meaningful to recover into, the button simply won't show "Copié".
    }
  }

  const handleExportPdf = () => {
    const canvas = document.querySelector('canvas')
    setSnapshotUrl(canvas ? canvas.toDataURL('image/png') : null)
    // Two rAFs: one to let the snapshot image actually paint into the
    // (until now display:none) print sheet, one more so the browser's
    // print-layout pass sees its real, final size before print() opens.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  const printSheet = createPortal(
    <div id="dimension-print-sheet" className="hidden bg-white p-8 text-black">
      <h1 className="mb-1 text-xl font-bold">Fiche dimensionnelle</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {targetLabel} : {targetName}
      </p>
      {snapshotUrl && <img src={snapshotUrl} alt="Vue 3D" className="mb-4 max-h-[70vh] w-full object-contain" />}
      <pre className="whitespace-pre-wrap font-mono text-xs">{buildPlainTextReport(report, targetLabel)}</pre>
    </div>,
    document.body,
  )

  if (collapsed) {
    return (
      <>
        <div className="flex shrink-0 items-start border-l border-[var(--border-light)] bg-[var(--bg-panel)]">
          <button
            title="Afficher la fiche dimensionnelle"
            onClick={() => setCollapsed(false)}
            className="p-2 text-slate-500 hover:text-slate-200"
          >
            <PanelRightOpen size={16} />
          </button>
        </div>
        {printSheet}
      </>
    )
  }

  return (
    <>
      <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border-light)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <ClipboardList size={12} /> Fiche dimensionnelle
          </span>
          <button
            title="Masquer la fiche dimensionnelle"
            onClick={() => setCollapsed(true)}
            className="text-slate-500 hover:text-slate-200"
          >
            <PanelRightClose size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {parts.length > 1 && (
            <select
              value={dimensionTargetNodeId ?? ''}
              onChange={(e) => setDimensionTargetNodeId(e.target.value || null)}
              className="mb-2 w-full rounded border border-[var(--border-light)] bg-[#0f0f1e] px-2 py-1 text-xs text-slate-200"
            >
              <option value="">Assemblage entier</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <p className="truncate text-xs text-slate-400">
            {targetLabel} : <span className="text-slate-300">{targetName}</span>
          </p>

          <SectionTitle>Encombrement</SectionTitle>
          <Row label="L × l × H" value={`${formatMm1(report.size.x)} × ${formatMm1(report.size.z)} × ${formatMm1(report.size.y)}`} />

          {report.diameterGroups.length > 0 && (
            <>
              <SectionTitle>Diamètres</SectionTitle>
              {diameterRows(report).map((row, i) => (
                <Row key={i} label={row.label} value={row.value} />
              ))}
              {report.pitchCircle && (
                <Row
                  label="Entraxe"
                  value={
                    report.pitchCircle.angleStep
                      ? `⌀ ${formatMm(report.pitchCircle.diameter)} (${formatDeg(report.pitchCircle.angleStep)})`
                      : `⌀ ${formatMm(report.pitchCircle.diameter)}`
                  }
                />
              )}
            </>
          )}

          {visibleHeightRows(report).length > 0 && (
            <>
              <SectionTitle>Épaisseurs</SectionTitle>
              {visibleHeightRows(report).map((h, i) => (
                <Row key={i} label={h.label} value={formatMm(h.value)} />
              ))}
            </>
          )}

          {report.topSegments.length > 0 && (
            <>
              <SectionTitle>Longueurs principales</SectionTitle>
              {report.topSegments.map((s, i) => (
                <Row key={i} label={`Segment ${i + 1}`} value={formatMm(s.length)} />
              ))}
            </>
          )}

          <SectionTitle>Propriétés</SectionTitle>
          <Row label="Volume" value={`${(report.volumeMm3 / 1000).toFixed(1)} cm³`} />
          <Row label="Surface" value={`${(report.surfaceMm2 / 100).toFixed(1)} cm²`} />
          <Row label="Triangles" value={report.triangleCount.toLocaleString('fr-FR')} />
        </div>

        <div className="flex gap-1.5 border-t border-[var(--border-light)] p-2">
          <button
            onClick={handleExportPdf}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400"
          >
            <Printer size={13} /> Exporter PDF
          </button>
          <button
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/5 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
          >
            {copyStatus === 'copied' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copyStatus === 'copied' ? 'Copié' : 'Copier'}
          </button>
        </div>
      </aside>
      {printSheet}
    </>
  )
}
