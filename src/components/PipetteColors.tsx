import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Grid3x3, Pipette } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { PAINT_COLORS } from '../utils/colorPalette'

// Colour choice of the Pipette (paint) tool, in the toolbar's options row:
// current colour (opens the system picker), quick colours, a "Nuancier" -
// a table of hues × shades - and an "Adoucir" slider.
//
// Every choice is a BASE colour; what gets painted is that base softened by
// the slider (see soften), so moving the slider re-softens the last choice
// instead of compounding on an already-softened colour. Base and softness
// live at module level so they survive the tool being closed and reopened.

let lastBase: string | null = null
let lastSoftness = 0

// Hues of the table's columns (degrees) - warm to cool, then magentas.
const HUES = [0, 20, 35, 50, 75, 120, 160, 185, 205, 230, 265, 295, 330]
// Lightness of its rows (%), from the palest tint to the deepest shade.
const LIGHTNESS = [90, 78, 66, 54, 42, 30]
const GRAYS = [96, 82, 66, 50, 34, 18]

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

// Softening = less saturation and a move toward a light, slightly warm gray:
// at 100 % a vivid red becomes a dusty pink, a navy a soft gray-blue - the hue
// is always kept, so the part stays recognisably "the red one".
function soften(hex: string, amount: number): string {
  if (amount <= 0) return hex.toLowerCase()
  const k = Math.min(1, amount / 100)
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s * (1 - 0.65 * k), l + (80 - l) * 0.6 * k)
}

const TABLE: string[][] = LIGHTNESS.map((l, row) => [
  ...HUES.map((h) => hslToHex(h, 78, l)),
  hslToHex(0, 0, GRAYS[row]),
])

export function PipetteColors({ isMobile }: { isMobile: boolean }) {
  const paintColor = useModelStore((s) => s.paintColor)
  const setPaintColor = useModelStore((s) => s.setPaintColor)
  const [chosenBase, setBase] = useState(() => lastBase ?? paintColor)
  const [chosenSoftness, setSoftness] = useState(lastSoftness)
  // The paint colour can also be set elsewhere (the IA command "peins en
  // bleu"): when it no longer matches our choice, it becomes the base, unsoftened.
  const inSync = paintColor.toLowerCase() === soften(chosenBase, chosenSoftness)
  const base = inSync ? chosenBase : paintColor
  const softness = inSync ? chosenSoftness : 0
  const [tableOpen, setTableOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const pipettePicking = useModelStore((s) => s.pipettePicking)
  const setPipettePicking = useModelStore((s) => s.setPipettePicking)
  const lastPaintedCount = useModelStore((s) => s.lastPaintedIds.length)
  const retintLastPainted = useModelStore((s) => s.retintLastPainted)

  // A new BASE colour (swatch, table, free picker) starts a new painting: the
  // last painted parts are let go, so moving "Adoucir" afterwards can't
  // repaint them with a colour they never had.
  const choose = (color: string, amount = softness) => {
    lastBase = color
    lastSoftness = amount
    setBase(color)
    setSoftness(amount)
    setPaintColor(soften(color, amount))
    useModelStore.setState({ lastPaintedIds: [] })
  }

  // "Adoucir" acts at once: the paint colour AND the part(s) painted last
  // are re-tinted on every move of the slider.
  const adjustSoftness = (amount: number) => {
    lastBase = base
    lastSoftness = amount
    setBase(base)
    setSoftness(amount)
    const color = soften(base, amount)
    setPaintColor(color)
    retintLastPainted(color)
  }

  // Outside click / Escape closes the table (the Escape that leaves the
  // pipette itself is handled in App.tsx and still works once it's closed).
  useEffect(() => {
    if (!tableOpen) return
    const onDown = (e: PointerEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setTableOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setTableOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [tableOpen])

  const isBase = (value: string) => base.toLowerCase() === value.toLowerCase()

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-sky-300">
      {/* Colour actually painted (softened); the swatch opens the system picker. */}
      <label
        title={`Couleur peinte : ${paintColor} - cliquez pour une couleur libre`}
        className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/50 shadow"
        style={{ backgroundColor: paintColor }}
      >
        <input
          type="color"
          value={base}
          onChange={(e) => choose(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <span className="flex items-center gap-1">
        {PAINT_COLORS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => choose(value)}
            className={`h-4 w-4 shrink-0 rounded-full border transition-transform hover:scale-125 ${
              isBase(value) ? 'border-white ring-2 ring-sky-400' : 'border-white/30'
            }`}
            style={{ backgroundColor: soften(value, softness) }}
          />
        ))}
      </span>

      <div ref={popoverRef} className="relative">
        <button
          type="button"
          onClick={() => setTableOpen(!tableOpen)}
          title="Tableau de couleurs : toutes les teintes, du plus clair au plus foncé"
          className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
            tableOpen ? 'bg-[var(--bg-active)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Grid3x3 size={13} />
          Nuancier
          <ChevronDown size={12} />
        </button>
        {tableOpen && (
          <div className="absolute top-full left-0 z-50 mt-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] p-3 shadow-xl">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${HUES.length + 1}, 1.25rem)` }}>
              {TABLE.flat().map((value) => (
                <button
                  key={value}
                  type="button"
                  title={softness > 0 ? `${value} → adoucie ${soften(value, softness)}` : value}
                  onClick={() => choose(value)}
                  className={`h-5 w-5 rounded border transition-transform hover:z-10 hover:scale-125 ${
                    isBase(value) ? 'border-white ring-2 ring-sky-400' : 'border-black/20'
                  }`}
                  style={{ backgroundColor: soften(value, softness) }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              {softness > 0 ? `Couleurs affichées adoucies à ${softness} %` : 'Couleurs franches'} - réglez « Adoucir »
              dans la barre
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setPipettePicking(!pipettePicking)}
        aria-pressed={pipettePicking}
        title="Prélever la couleur d'une pièce (ou Alt+clic sur la pièce), puis cliquer sur une autre pièce pour la lui donner"
        className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
          pipettePicking ? 'bg-[var(--bg-active)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Pipette size={13} />
        Prélever
      </button>

      <label
        className="flex items-center gap-2 text-[var(--text-secondary)]"
        title={
          lastPaintedCount > 0
            ? 'Rend la couleur plus douce, en direct sur la dernière pièce peinte'
            : 'Rend la couleur plus douce (moins vive, plus claire)'
        }
      >
        Adoucir
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={softness}
          onChange={(e) => adjustSoftness(Number(e.target.value))}
          aria-label="Adoucir la couleur"
          className="h-1.5 w-24 accent-[var(--bg-active)]"
        />
        <span className="w-8 text-right text-[var(--text-secondary)]">{softness} %</span>
      </label>

      <span>
        {pipettePicking
          ? isMobile
            ? 'Touchez la pièce dont vous voulez la couleur'
            : 'Cliquez sur la pièce dont vous voulez copier la couleur'
          : lastPaintedCount > 0
            ? `« Adoucir » agit en direct sur ${lastPaintedCount > 1 ? `les ${lastPaintedCount} dernières pièces peintes` : 'la dernière pièce peinte'}`
            : isMobile
              ? 'Choisissez la couleur puis touchez les pièces à peindre'
              : 'Choisissez ou prélevez (Alt+clic) une couleur, puis cliquez sur les pièces à peindre'}
      </span>
    </span>
  )
}
