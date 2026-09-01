import { jsPDF } from 'jspdf'
import type { Annotation, DimensionReport, Measurement } from '../types/model'
import { resizeImageDataUrl } from './imageUtils'

const VIEW_CAPTURE_WIDTH = 1200
const VIEW_CAPTURE_HEIGHT = 900

export interface ViewCaptures {
  iso: string
  front: string
  top: string
  right: string
}

export interface PdfExportInput {
  fileName: string
  projectName: string
  dimensionReport: DimensionReport | null
  measurements: Measurement[]
  annotations: Annotation[]
  viewCaptures: ViewCaptures
  logoDataUrl: string | null
}

const INK = { r: 30, g: 41, b: 59 } // slate-800
const MUTED = { r: 100, g: 116, b: 139 } // slate-500
const ACCENT = { r: 37, g: 99, b: 235 } // blue-600

function formatMm(value: number) {
  return `${value.toFixed(2)} mm`
}

function setTextRGB(doc: jsPDF, c: { r: number; g: number; b: number }) {
  doc.setTextColor(c.r, c.g, c.b)
}

function drawHeader(doc: jsPDF, logoDataUrl: string | null, input: PdfExportInput, pageWidth: number) {
  const margin = 12
  let logoWidth = 0

  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl)
      const logoHeight = 16
      logoWidth = (props.width / props.height) * logoHeight
      doc.addImage(logoDataUrl, 'PNG', margin, 8, logoWidth, logoHeight)
    } catch {
      logoWidth = 0
    }
  }

  const textX = margin + logoWidth + (logoWidth > 0 ? 5 : 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  setTextRGB(doc, INK)
  doc.text('PINDI CAD VIEWER', textX, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextRGB(doc, MUTED)
  doc.text('Fiche Technique', textX, 20)

  const rightX = pageWidth - margin
  doc.setFontSize(9)
  doc.text(`Fichier : ${input.fileName}`, rightX, 10, { align: 'right' })
  doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, rightX, 15, { align: 'right' })
  if (input.projectName.trim()) {
    doc.text(`Projet : ${input.projectName.trim()}`, rightX, 20, { align: 'right' })
  }

  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(0.6)
  doc.line(margin, 25, pageWidth - margin, 25)
}

async function drawViewGrid(doc: jsPDF, captures: ViewCaptures, pageWidth: number, pageHeight: number) {
  const margin = 12
  const top = 32
  const gap = 6
  const cellWidth = (pageWidth - margin * 2 - gap) / 2
  const cellHeight = (pageHeight - top - margin - gap) / 2
  const cellAspect = VIEW_CAPTURE_WIDTH / VIEW_CAPTURE_HEIGHT

  // Fit each cell to the capture's own aspect ratio within the grid slot,
  // rather than stretching it to exactly fill a differently-proportioned
  // rectangle.
  let drawWidth = cellWidth
  let drawHeight = drawWidth / cellAspect
  if (drawHeight > cellHeight) {
    drawHeight = cellHeight
    drawWidth = drawHeight * cellAspect
  }

  const entries: { label: string; key: keyof ViewCaptures }[] = [
    { label: 'Vue ISO', key: 'iso' },
    { label: 'Vue FACE', key: 'front' },
    { label: 'Vue DESSUS', key: 'top' },
    { label: 'Vue DROITE', key: 'right' },
  ]

  for (let i = 0; i < entries.length; i++) {
    const { label, key } = entries[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const cellX = margin + col * (cellWidth + gap)
    const cellY = top + row * (cellHeight + gap)
    const imageX = cellX + (cellWidth - drawWidth) / 2
    const imageY = cellY + (cellHeight - drawHeight) / 2

    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.rect(cellX, cellY, cellWidth, cellHeight)

    const resized = await resizeImageDataUrl(captures[key], VIEW_CAPTURE_WIDTH, VIEW_CAPTURE_HEIGHT, '#ffffff')
    doc.addImage(resized, 'PNG', imageX, imageY, drawWidth, drawHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setTextRGB(doc, INK)
    doc.text(label, cellX + 2, cellY + 5)
  }
}

interface Cursor {
  y: number
}

function sectionTitle(doc: jsPDF, text: string, x: number, cursor: Cursor) {
  cursor.y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextRGB(doc, ACCENT)
  doc.text(text, x, cursor.y)
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(0.3)
  doc.line(x, cursor.y + 1.5, x + 60, cursor.y + 1.5)
  cursor.y += 6
}

function row(doc: jsPDF, label: string, value: string, x: number, cursor: Cursor, valueX = 55) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRGB(doc, MUTED)
  doc.text(label, x, cursor.y)
  doc.setFont('helvetica', 'bold')
  setTextRGB(doc, INK)
  doc.text(value, x + valueX, cursor.y)
  cursor.y += 5.5
}

function bulletLine(doc: jsPDF, text: string, x: number, cursor: Cursor, maxWidth: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRGB(doc, INK)
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  doc.text(lines, x, cursor.y)
  cursor.y += 5 * lines.length
}

function drawDimensionsPage(doc: jsPDF, input: PdfExportInput, pageWidth: number) {
  const margin = 14
  const cursor: Cursor = { y: 16 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setTextRGB(doc, INK)
  doc.text('FICHE DIMENSIONNELLE', margin, cursor.y)
  cursor.y += 8
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.line(margin, cursor.y, pageWidth - margin, cursor.y)

  const report = input.dimensionReport
  if (report) {
    sectionTitle(doc, 'DIMENSIONS', margin, cursor)
    row(doc, 'Encombrement (L x l x H)', `${formatMm(report.size.x)} x ${formatMm(report.size.z)} x ${formatMm(report.size.y)}`, margin, cursor)
    row(doc, 'Volume', `${(report.volumeMm3 / 1000).toFixed(1)} cm³`, margin, cursor)
    row(doc, 'Surface', `${(report.surfaceMm2 / 100).toFixed(1)} cm²`, margin, cursor)
    row(doc, 'Triangles', report.triangleCount.toLocaleString('fr-FR'), margin, cursor)

    if (report.diameterGroups.length > 0) {
      sectionTitle(doc, 'DIAMÈTRES', margin, cursor)
      report.diameterGroups.forEach((group, i) => {
        const tag = i === report.largestGroupIndex ? ' ext. max' : i === report.centralBoreGroupIndex ? ' alésage' : ''
        const label = tag ? `⌀${tag}` : group.count > 1 ? `${group.count}× ⌀` : '⌀'
        const suffix = group.count > 1 && !tag ? ' (perçages)' : ''
        row(doc, label, `${formatMm(group.radius * 2)}${suffix}`, margin, cursor)
      })
      if (report.pitchCircle) {
        const angle = report.pitchCircle.angleStep
          ? ` (tous les ${((report.pitchCircle.angleStep * 180) / Math.PI).toFixed(1)}°)`
          : ''
        row(doc, 'Entraxe', `⌀ ${formatMm(report.pitchCircle.diameter)}${angle}`, margin, cursor)
      }
    }

    const heightRows = report.heights.length > 7 ? report.heights.filter((h) => h.label === 'Total') : report.heights
    if (heightRows.length > 0) {
      sectionTitle(doc, 'ÉPAISSEURS', margin, cursor)
      for (const h of heightRows) row(doc, h.label, formatMm(h.value), margin, cursor)
    }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    setTextRGB(doc, MUTED)
    doc.text("Aucune analyse dimensionnelle n'a été calculée pour ce modèle.", margin, cursor.y)
    cursor.y += 6
  }

  if (input.measurements.length > 0) {
    sectionTitle(doc, 'MESURES MANUELLES', margin, cursor)
    input.measurements.forEach((m, i) => {
      // Matches the same plain "always show ⌀" convention already used in
      // MeasurementsPanel.tsx's saved-measurements list, rather than the
      // arc-aware R/⌀ distinction the live 3D hover/click labels use.
      const value = m.type === 'distance' ? formatMm(m.distance ?? 0) : `⌀ ${formatMm((m.radius ?? 0) * 2)}`
      row(doc, `Mesure ${i + 1}`, value, margin, cursor)
    })
  }

  if (input.annotations.length > 0) {
    sectionTitle(doc, 'ANNOTATIONS', margin, cursor)
    input.annotations.forEach((a, i) => {
      bulletLine(doc, `${i + 1}. ${a.text}`, margin, cursor, pageWidth - margin * 2)
    })
  }

  sectionTitle(doc, 'REMARQUES', margin, cursor)
  cursor.y += 2
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  for (let i = 0; i < 3; i++) {
    doc.line(margin, cursor.y, pageWidth - margin, cursor.y)
    cursor.y += 8
  }

  cursor.y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRGB(doc, MUTED)
  doc.text('Validé par : ______________________', margin, cursor.y)
  doc.text('Date : ______________', pageWidth - margin - 45, cursor.y)
}

// Builds the two-page technical sheet described in the spec: page 1 is the
// 4-view capture grid, page 2 is the dimensions/measurements/annotations
// table with blank remarks lines and a signature line - all drawn as native
// PDF text/vector content (crisp at any zoom, unlike a rasterized DOM
// screenshot), reusing exactly the same dimension-report data the on-screen
// "Fiche dimensionnelle" panel already computes.
export async function generateTechnicalSheetPdf(input: PdfExportInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const landscapeWidth = doc.internal.pageSize.getWidth()
  const landscapeHeight = doc.internal.pageSize.getHeight()

  drawHeader(doc, input.logoDataUrl, input, landscapeWidth)
  await drawViewGrid(doc, input.viewCaptures, landscapeWidth, landscapeHeight)

  doc.addPage('a4', 'portrait')
  const portraitWidth = doc.internal.pageSize.getWidth()
  drawDimensionsPage(doc, input, portraitWidth)

  return doc
}
