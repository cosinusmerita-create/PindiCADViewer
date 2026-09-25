import * as THREE from 'three'
import { zipSync, strToU8 } from 'fflate'
import { pocketRing, sliceSoup, type JointOptions, type JointPlan, type PinShape, type SlicePiece } from './meshCut'
import { writeBinaryStl } from './stlWriter'
import { writeBoxesStep, type StepBox } from './stepWriter'
import type { PrintAxis } from '../hooks/usePrintStore'

// Port du module « export de fabrication » de Pindi Blade Profiler : réduire la
// pièce à l'échelle, la découper en tronçons qui tiennent sur le plateau, puis
// exporter un STL par tronçon (Z vers le haut, base à Z=0) dans un zip.
// Différence : Blade Profiler génère ses tronçons de façon paramétrique (avec
// un perçage central) ; ici on coupe un maillage QUELCONQUE, donc les tronçons
// sont pleins/creux comme la pièce d'origine, sans perçage ni clavette ajoutés.

// Triangles (9 nombres) de toutes les mailles données, en repère monde, donc
// avec les déplacements d'animation/éclatement en cours.
export function collectWorldSoup(meshes: THREE.Mesh[]): Float32Array {
  const chunks: number[][] = []
  const v = new THREE.Vector3()
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) continue
    mesh.updateWorldMatrix(true, false)
    const index = mesh.geometry.getIndex()
    const n = index ? index.count : pos.count
    const out: number[] = []
    // Miroir (déterminant < 0) : inverse le sens des triangles pour garder
    // des normales sortantes.
    const flip = mesh.matrixWorld.determinant() < 0
    for (let i = 0; i + 2 < n; i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j))
      if (flip) ids.reverse()
      for (const id of ids) {
        v.fromBufferAttribute(pos, id).applyMatrix4(mesh.matrixWorld)
        out.push(v.x, v.y, v.z)
      }
    }
    chunks.push(out)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const soup = new Float32Array(total)
  let o = 0
  for (const c of chunks) {
    soup.set(c, o)
    o += c.length
  }
  return soup
}

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export function soupBounds(soup: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const x = soup[i + k]
      if (x < min[k]) min[k] = x
      if (x > max[k]) max[k] = x
    }
  }
  return { min, max }
}

export function longestAxis(b: Bounds): PrintAxis {
  const s = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  return (['x', 'y', 'z'] as const)[s.indexOf(Math.max(...s))]
}

// Les trancheurs attendent Z vers le haut alors que le viewer est Y vers le
// haut. Le mapping est une vraie rotation (déterminant +1, pas un miroir) qui
// amène l'axe de coupe sur Z : y -> (x, -z, y) comme Blade Profiler ; z ne
// change rien ; x -> (y, z, x) par permutation circulaire. Ensuite mise à
// l'échelle, centrage XY et base à Z=0.
export function toPrintSpace(soup: Float32Array, axis: PrintAxis, scale: number, bounds: Bounds): Float32Array {
  const out = new Float32Array(soup.length)
  const map = (x: number, y: number, z: number): [number, number, number] =>
    axis === 'y' ? [x, -z, y] : axis === 'x' ? [y, z, x] : [x, y, z]
  const lo = map(...bounds.min)
  const hi = map(...bounds.max)
  // map() peut échanger le sens des min/max (cas axe y : -z) : on reprend
  // les vraies bornes de la pièce dans le repère d'impression.
  const minX = Math.min(lo[0], hi[0]), maxX = Math.max(lo[0], hi[0])
  const minY = Math.min(lo[1], hi[1]), maxY = Math.max(lo[1], hi[1])
  const minZ = Math.min(lo[2], hi[2])
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (let i = 0; i < soup.length; i += 3) {
    const [x, y, z] = map(soup[i], soup[i + 1], soup[i + 2])
    out[i] = (x - cx) * scale
    out[i + 1] = (y - cy) * scale
    out[i + 2] = (z - minZ) * scale
  }
  return out
}

export function segmentCount(height: number, mode: 'count' | 'height', count: number, maxHeight: number, maxCount: number) {
  if (mode === 'count') return Math.min(maxCount, Math.max(1, Math.round(count)))
  return Math.min(maxCount, Math.max(1, Math.ceil(height / Math.max(1, maxHeight) - 1e-9)))
}

export function cutPlanes(height: number, n: number): number[] {
  return Array.from({ length: n - 1 }, (_, k) => ((k + 1) * height) / n)
}

export interface PieceInfo {
  index: number
  w: number
  d: number
  h: number
}

export function pieceInfo(p: SlicePiece, index: number): PieceInfo {
  return { index, w: p.max[0] - p.min[0], d: p.max[1] - p.min[1], h: p.max[2] - p.min[2] }
}

// Un tronçon tient si son empreinte (posable dans les deux sens) rentre dans
// X×Y du plateau et que sa hauteur rentre dans Z.
export function fitsBed(p: PieceInfo, bed: { x: number; y: number; z: number }): boolean {
  const [a, b] = [p.w, p.d].sort((x, y) => y - x)
  const [ba, bb] = [bed.x, bed.y].sort((x, y) => y - x)
  return a <= ba + 1e-6 && b <= bb + 1e-6 && p.h <= bed.z + 1e-6
}

function readme(opts: {
  baseName: string
  scalePct: number
  pieces: PieceInfo[]
  axis: PrintAxis
  openLoops: number
  joint: { options: JointOptions; shape: PinShape | null; plans: JointPlan[]; misses: number } | null
}): string {
  const lines = [
    `Tronçons d'impression 3D - ${opts.baseName}`,
    '',
    `Échelle appliquée : ${opts.scalePct.toFixed(1)} %`,
    `Nombre de tronçons : ${opts.pieces.length} (coupe perpendiculaire à l'axe ${opts.axis.toUpperCase()} du modèle)`,
    '',
    'Chaque fichier .stl est orienté Z vers le haut, base posée à Z = 0, dimensions en mm.',
    "Chaque tronçon a des faces de coupe planes et fermées : il s'imprime posé sur sa face de coupe basse.",
    "Les tronçons se collent (ou se goupillent) face contre face, dans l'ordre de leur numéro (1 = bas).",
    '',
    'Encombrement (L x l x H, mm) :',
    ...opts.pieces.map((p) => `  ${String(p.index).padStart(2, '0')} : ${p.w.toFixed(1)} x ${p.d.toFixed(1)} x ${p.h.toFixed(1)}`),
  ]
  if (opts.joint) {
    const { options: o, plans, misses, shape } = opts.joint
    const pinCount = plans.reduce((n, p) => n + p.centers.length, 0)
    const len = plans.length ? Math.min(...plans.map((p) => 2 * p.depth)) - 0.6 : 0
    lines.push(
      '',
      'EMBOÎTEMENT (broches carrées)',
      `  Alvéoles de ${shape ? (shape.w + 2 * o.clearance).toFixed(2) : '-'} x ${shape ? (shape.l + 2 * o.clearance).toFixed(2) : '-'} mm (broche ${shape ? shape.w : '-'} x ${shape ? shape.l : '-'} mm + jeu ${o.clearance} mm par côté) sur les faces de coupe, orientées dans le sens de la corde.`,
      `  Toutes les broches sont identiques : UN seul modèle (fichier broche_emboitement.stl, ${shape ? shape.w : '-'} x ${shape ? shape.l : '-'} x ${len.toFixed(1)} mm) à imprimer en ${pinCount} exemplaire(s), à PLAT pour résister au cisaillement.`,
      '  Un profil non rond bloque la rotation des tronçons entre eux (torsion de la pale).',
      ...plans.map((p) => `  Plan ${p.plane + 1} : ${p.centers.length} alvéole(s), profondeur ${p.depth.toFixed(1)} mm dans chaque tronçon`),
    )
    if (shape && shape.w < o.size) lines.push(`  Broche réduite de ${o.size} à ${shape.w} mm de large : la section de la pièce est trop mince pour la taille demandée.`)
    if (plans.length === 0) lines.push('  Aucun emboîtement possible : sections trop minces ou tronçons trop courts.')
    if (misses > 0) lines.push(`  ATTENTION : ${misses} plan(s) de coupe sans emboîtement complet (section trop mince ou tronçon trop court).`)
  }
  lines.push(
    '',
    'CONSEILS',
    '  - Imprimez chaque tronçon debout, face de coupe sur le plateau (couches perpendiculaires à la flexion).',
    '  - Bordure (brim) de 8 à 10 mm dans le trancheur pour stabiliser la pièce en hauteur.',
    "  - 3 à 4 périmètres (1,2 à 1,6 mm). Poncez les faces d'assemblage (grain 120/180).",
    '  - Colle : époxy bi-composant (comble les petits vides, tient aux vibrations) ; cyanoacrylate + activateur pour pointer.',
    '  - Finition : primaire de charge puis vernis anti-UV (PLA / PETG).',
  )
  if (opts.openLoops > 0) {
    lines.push(
      '',
      `ATTENTION : ${opts.openLoops} contour(s) de coupe ne se referment pas (maillage source non étanche) :`,
      'les faces de coupe correspondantes peuvent être incomplètes. Vérifiez dans le trancheur.',
    )
  }
  lines.push('', 'Généré par PindiCADViewer.')
  return lines.join('\r\n') + '\r\n'
}

// Construit le zip des tronçons (STL binaires + LISEZ-MOI).
export function buildPiecesZip(
  printSoup: Float32Array,
  planes: number[],
  baseName: string,
  scalePct: number,
  axis: PrintAxis,
  joint: JointOptions | null = null,
) {
  const { pieces, openLoops, joints, jointMisses, usedShape } = sliceSoup(printSoup, planes, true, joint)
  const infos = pieces.map((p, i) => pieceInfo(p, i + 1))
  const files: Record<string, Uint8Array> = {}
  pieces.forEach((p, i) => {
    // Chaque tronçon repart de Z = 0 (les X/Y restent dans le repère commun,
    // donc les tronçons restent alignés entre eux).
    const shift = p.min[2]
    const pos = new Float32Array(p.positions.length)
    for (let k = 0; k < pos.length; k += 3) {
      pos[k] = p.positions[k]
      pos[k + 1] = p.positions[k + 1]
      pos[k + 2] = p.positions[k + 2] - shift
    }
    const name = `${baseName}_troncon_${String(i + 1).padStart(2, '0')}_sur_${String(pieces.length).padStart(2, '0')}.stl`
    files[name] = writeBinaryStl(pos, name)
  })
  const pinCount = joints.reduce((n, p) => n + p.centers.length, 0)
  if (usedShape && pinCount > 0) {
    const len = Math.min(...joints.map((p) => 2 * p.depth)) - 0.6
    // Toutes les broches ont la même forme : un seul modèle, à imprimer en `pinCount` exemplaires.
    files['broche_emboitement.stl'] = writeBinaryStl(pinsLayout(1, usedShape, len), 'broche')
  }
  files['LISEZ-MOI_impression.txt'] = strToU8(
    readme({
      baseName,
      scalePct,
      pieces: infos,
      axis,
      openLoops,
      joint: joint ? { options: joint, shape: usedShape, plans: joints, misses: jointMisses } : null,
    }),
  )
  return { zip: zipSync(files, { level: 0 }), infos, openLoops, pinCount, jointMisses, usedShape }
}

// Broches (parallélépipèdes size x size x len) posées À PLAT sur le plateau, en
// rangée le long de Y, base à Z = 0 : le fil est dans le sens de la longueur,
// donc résistant au cisaillement. Faces sortantes (sens antihoraire vu de dehors).
function pinsLayout(count: number, shape: PinShape, len: number): number[] {
  const out: number[] = []
  const gap = 4
  for (let i = 0; i < count; i++) {
    const y0 = i * (shape.l + gap)
    const [x0, x1, y1, z1] = [0, len, y0 + shape.l, shape.w]
    const v = (x: number, y: number, z: number) => [x, y, z]
    const quad = (a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d)
    quad(v(x0, y0, 0), v(x0, y1, 0), v(x1, y1, 0), v(x1, y0, 0)) // bas (-z)
    quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)) // haut (+z)
    quad(v(x0, y0, 0), v(x1, y0, 0), v(x1, y0, z1), v(x0, y0, z1)) // -y
    quad(v(x0, y1, 0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, 0)) // +y
    quad(v(x0, y0, 0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, 0)) // -x
    quad(v(x1, y0, 0), v(x1, y1, 0), v(x1, y1, z1), v(x1, y0, z1)) // +x
  }
  return out
}

// Repère d'impression d'une pièce : mêmes constantes que toPrintSpace.
function printFrame(axis: PrintAxis, bounds: Bounds) {
  const map = (x: number, y: number, z: number): [number, number, number] =>
    axis === 'y' ? [x, -z, y] : axis === 'x' ? [y, z, x] : [x, y, z]
  const lo = map(...bounds.min)
  const hi = map(...bounds.max)
  return {
    cx: (Math.min(lo[0], hi[0]) + Math.max(lo[0], hi[0])) / 2,
    cy: (Math.min(lo[1], hi[1]) + Math.max(lo[1], hi[1])) / 2,
    minZ: Math.min(lo[2], hi[2]),
  }
}

// Parallélépipède (base carrée) en triangles sortants.
function boxTriangles(ring: [number, number][], z0: number, z1: number, out: number[]) {
  const quad = (a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d)
  const p = (i: number, z: number) => [ring[i][0], ring[i][1], z]
  quad(p(0, z0), p(3, z0), p(2, z0), p(1, z0))
  quad(p(0, z1), p(1, z1), p(2, z1), p(3, z1))
  for (let i = 0; i < 4; i++) quad(p(i, z0), p((i + 1) % 4, z0), p((i + 1) % 4, z1), p(i, z1))
}

// Aperçu 3D : les VRAIS tronçons découpés (alvéoles comprises), écartés les uns
// des autres le long de l'axe de coupe, avec les broches entre eux. Tout est
// renvoyé dans le repère du viewer et à la taille d'origine (l'échelle d'impression
// est annulée), donc il se superpose exactement au modèle qu'il remplace.
export function buildPreview(
  printSoup: Float32Array,
  planes: number[],
  axis: PrintAxis,
  scale: number,
  bounds: Bounds,
  gapPct: number,
  joint: JointOptions | null,
  baseName: string,
) {
  const { pieces, joints, usedShape, jointMisses } = sliceSoup(printSoup, planes, true, joint)
  const { cx, cy, minZ } = printFrame(axis, bounds)
  const height = pieces.length ? Math.max(...pieces.map((p) => p.max[2])) / pieces.length : 0
  const gap = (height * gapPct) / 100
  const toViewer = (pos: ArrayLike<number>, dz: number) => {
    const out = new Float32Array(pos.length)
    for (let i = 0; i < pos.length; i += 3) {
      const X = pos[i] / scale + cx
      const Y = pos[i + 1] / scale + cy
      const Z = (pos[i + 2] + dz) / scale + minZ
      const [x, y, z] = axis === 'y' ? [X, Z, -Y] : axis === 'x' ? [Z, X, Y] : [X, Y, Z]
      out[i] = x
      out[i + 1] = y
      out[i + 2] = z
    }
    return out
  }
  const pins: number[] = []
  for (const j of joints) {
    const zc = planes[j.plane] + j.plane * gap + gap / 2
    for (const [x, y] of j.centers) boxTriangles(pocketRing(x, y, (usedShape ? usedShape.w : 4) / 2, (usedShape ? usedShape.l : 4) / 2, j.angle), zc - j.depth + 0.3, zc + j.depth - 0.3, pins)
  }
  return {
    stats: pieces.map((p, k) => ({
      name: `${baseName}_troncon_${String(k + 1).padStart(2, '0')}_sur_${String(pieces.length).padStart(2, '0')}.stl`,
      w: p.max[0] - p.min[0],
      d: p.max[1] - p.min[1],
      h: p.max[2] - p.min[2],
      volume: meshVolume(p.positions),
      triangles: p.positions.length / 9,
    })),
    pieces: pieces.map((p, k) => toViewer(p.positions, k * gap)),
    pins: pins.length ? toViewer(pins, 0) : null,
    pinCount: joints.reduce((k, j) => k + j.centers.length, 0),
    usedShape,
    misses: jointMisses,
  }
}

// Volume (mm³) d'un maillage fermé à normales sortantes : somme des tétraèdres
// signés depuis l'origine.
function meshVolume(pos: ArrayLike<number>): number {
  let v = 0
  for (let i = 0; i + 8 < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5], pos[i + 6], pos[i + 7], pos[i + 8]]
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(v)
}

// Fichiers de LA broche (STL maillé + STEP B-rep), à conserver pour imprimer
// plus tard : toutes les broches étant identiques, un seul modèle suffit ; `count`
// est la quantité à imprimer.
export function buildPinFiles(printSoup: Float32Array, planes: number[], joint: JointOptions, baseName: string) {
  const { joints, usedShape } = sliceSoup(printSoup, planes, true, joint)
  const count = joints.reduce((k, j) => k + j.centers.length, 0)
  if (!usedShape || count === 0) return null
  const length = Math.min(...joints.map((j) => 2 * j.depth)) - 0.6
  // Toutes les broches ont la même forme : UN seul modèle, à imprimer en `count` exemplaires.
  const boxes: StepBox[] = [{ x: 0, y: 0, z: 0, dx: length, dy: usedShape.l, dz: usedShape.w }]
  const name = `${baseName}_broche_${usedShape.w}x${usedShape.l}x${length.toFixed(1)}mm`
  return {
    count,
    shape: usedShape,
    length,
    name,
    stl: writeBinaryStl(pinsLayout(1, usedShape, length), name),
    step: writeBoxesStep(boxes, name),
  }
}
