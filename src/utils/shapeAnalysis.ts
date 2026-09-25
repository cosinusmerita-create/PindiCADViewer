import * as THREE from 'three'

// Geometry-based identification of the parts of an assembly, used to
//  1. give the same color to parts that are the same shape ("4 identical
//     screws must not each get a different color"), and
//  2. name parts that came without a name (many STEP exporters only write
//     generic numbered names), e.g. "Pale 1/3" or "Tige Ø20 × 1500".
//
// Everything here must be independent of WHERE and HOW a part is placed: the
// loader bakes world-space positions into each mesh, so three copies of the
// same blade sit at different positions and rotations. Hence only invariants
// are compared: surface area, volume, and the principal moments of the
// surface (eigenvalues of its area-weighted covariance).

export type ShapeKind = 'rod' | 'disc' | 'plate' | 'blade' | 'block'

export interface ShapeSignature {
  area: number
  volume: number
  // Eigenvalues of the area-weighted covariance of the surface, descending.
  moments: [number, number, number]
  // Oriented-bounding-box side lengths along the principal axes, descending.
  extents: [number, number, number]
  kind: ShapeKind
}

// 3x3 symmetric eigen-decomposition (Jacobi rotations). Returns eigenvalues and
// the matching eigenvectors as columns, sorted by descending eigenvalue.
function eigenSymmetric(m: number[][]): { values: number[]; vectors: THREE.Vector3[] } {
  const a = m.map((row) => row.slice())
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2])
    if (off < 1e-14) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      if (Math.abs(a[p][q]) < 1e-30) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p]
        const akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k]
        const aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p]
        const vkq = v[k][q]
        v[k][p] = c * vkp - s * vkq
        v[k][q] = s * vkp + c * vkq
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i])
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i) => new THREE.Vector3(v[0][i], v[1][i], v[2][i])),
  }
}

export function analyzeShape(geometry: THREE.BufferGeometry): ShapeSignature {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triCount = index ? index.count / 3 : position.count / 3
  const at = (i: number, target: THREE.Vector3) =>
    target.fromBufferAttribute(position, index ? index.getX(i) : i)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const cross = new THREE.Vector3()

  // Pass 1: area and area-weighted centroid of the surface.
  let area = 0
  const mean = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    at(t * 3, a)
    at(t * 3 + 1, b)
    at(t * 3 + 2, c)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    const w = cross.crossVectors(ab, ac).length() / 2
    area += w
    mean.x += (w * (a.x + b.x + c.x)) / 3
    mean.y += (w * (a.y + b.y + c.y)) / 3
    mean.z += (w * (a.z + b.z + c.z)) / 3
  }
  if (area <= 0) {
    return { area: 0, volume: 0, moments: [0, 0, 0], extents: [0, 0, 0], kind: 'block' }
  }
  mean.divideScalar(area)

  // Pass 2: volume (divergence theorem about the centroid, which keeps the
  // floating-point error small) and the covariance of the surface.
  let volume = 0
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let t = 0; t < triCount; t++) {
    at(t * 3, a).sub(mean)
    at(t * 3 + 1, b).sub(mean)
    at(t * 3 + 2, c).sub(mean)
    volume += a.dot(cross.crossVectors(b, c)) / 6
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    const w = cross.crossVectors(ab, ac).length() / 2
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    const cz = (a.z + b.z + c.z) / 3
    cov[0][0] += w * cx * cx
    cov[0][1] += w * cx * cy
    cov[0][2] += w * cx * cz
    cov[1][1] += w * cy * cy
    cov[1][2] += w * cy * cz
    cov[2][2] += w * cz * cz
  }
  cov[1][0] = cov[0][1]
  cov[2][0] = cov[0][2]
  cov[2][1] = cov[1][2]
  for (const row of cov) for (let k = 0; k < 3; k++) row[k] /= area

  const { values, vectors } = eigenSymmetric(cov)

  // Extents along the principal axes.
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const p = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(mean)
    for (let k = 0; k < 3; k++) {
      const d = p.dot(vectors[k])
      if (d < min[k]) min[k] = d
      if (d > max[k]) max[k] = d
    }
  }
  const extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].sort((x, y) => y - x) as [number, number, number]

  return {
    area,
    volume: Math.abs(volume),
    moments: [values[0], values[1], values[2]],
    extents,
    kind: classify(Math.abs(volume), extents),
  }
}

// Coarse shape family from how elongated / flat the solid is and how much of
// its bounding box it fills. Deliberately conservative: anything unclear stays
// a plain "block" and simply keeps a generic name.
function classify(volume: number, [a, b, c]: [number, number, number]): ShapeKind {
  if (a <= 0 || b <= 0) return 'block'
  const thin = Math.max(c, 1e-9)
  const fill = volume / (a * b * thin)
  // Long and slender with a roundish/square section: a shaft, rod or screw.
  if (a / b > 2 && b / thin < 1.5) return 'rod'
  // Short and round-ish in plan: a disc, washer, hub or ring.
  if (a / thin > 2 && a / b < 1.2) return 'disc'
  // A thin, solid slab.
  if (a / thin > 6 && fill > 0.5) return 'plate'
  // Long, wide and mostly hollow bounding box: a curved or twisted blade.
  if (a / b > 1.5 && b / thin > 1.3 && fill < 0.35) return 'blade'
  return 'block'
}

const REL = { area: 0.005, volume: 0.01, moment: 0.01 }

function close(x: number, y: number, tol: number, floor = 0): boolean {
  const scale = Math.max(Math.abs(x), Math.abs(y), floor)
  return scale === 0 ? true : Math.abs(x - y) <= tol * scale
}

export function sameShape(p: ShapeSignature, q: ShapeSignature): boolean {
  if (!close(p.area, q.area, REL.area)) return false
  if (!close(p.volume, q.volume, REL.volume, p.area * 1e-6)) return false
  // The smallest moment can be ~0 for a flat part, so it is compared against
  // the largest one rather than against itself.
  const big = Math.max(p.moments[0], q.moments[0])
  return p.moments.every((m, i) => close(m, q.moments[i], REL.moment, big * 1e-4))
}

// Group index per input, numbered in order of first appearance: identical
// shapes (whatever their position/rotation) share an index.
export function groupSimilarShapes(signatures: ShapeSignature[]): number[] {
  const representatives: ShapeSignature[] = []
  return signatures.map((sig) => {
    const found = representatives.findIndex((rep) => sameShape(rep, sig))
    if (found !== -1) return found
    representatives.push(sig)
    return representatives.length - 1
  })
}

const fmt = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString()

const BASE_NAME: Record<ShapeKind, string> = {
  rod: 'Tige',
  disc: 'Disque',
  plate: 'Plaque',
  blade: 'Pale',
  block: 'Pièce',
}

export function baseNameOf(sig: ShapeSignature): string {
  return BASE_NAME[sig.kind]
}

// Dimensions used to tell apart two DIFFERENT shapes that share a base name.
export function dimensionsOf(sig: ShapeSignature): string {
  const [a, b, c] = sig.extents
  switch (sig.kind) {
    case 'rod':
      return `Ø${fmt((b + c) / 2)} × ${fmt(a)}`
    case 'disc':
      return `Ø${fmt((a + b) / 2)} × ${fmt(c)}`
    default:
      return `${fmt(a)} × ${fmt(b)} × ${fmt(c)}`
  }
}

// Names for a whole assembly. `existing` holds names already provided by the
// file ('' when missing) - those are kept untouched. Generated names are the
// family ("Pale", "Tige"...), numbered when several parts share the shape
// ("Pale 1", "Pale 2", "Pale 3"), with the dimensions added only when two
// different shapes would otherwise get the same family name.
export function buildPartNames(signatures: ShapeSignature[], groups: number[], existing: string[]): string[] {
  const groupSig = new Map<number, ShapeSignature>()
  const groupSize = new Map<number, number>()
  signatures.forEach((sig, i) => {
    if (existing[i]) return
    const g = groups[i]
    if (!groupSig.has(g)) groupSig.set(g, sig)
    groupSize.set(g, (groupSize.get(g) ?? 0) + 1)
  })

  const groupsPerBase = new Map<string, number>()
  for (const sig of groupSig.values()) {
    const base = baseNameOf(sig)
    groupsPerBase.set(base, (groupsPerBase.get(base) ?? 0) + 1)
  }

  const seen = new Map<number, number>()
  return signatures.map((sig, i) => {
    if (existing[i]) return existing[i]
    const g = groups[i]
    const base = baseNameOf(sig)
    const label = (groupsPerBase.get(base) ?? 0) > 1 ? `${base} ${dimensionsOf(groupSig.get(g)!)}` : base
    if ((groupSize.get(g) ?? 1) <= 1) return label
    const n = (seen.get(g) ?? 0) + 1
    seen.set(g, n)
    return `${label} · ${n}`
  })
}
