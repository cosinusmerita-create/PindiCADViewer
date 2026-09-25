import * as THREE from 'three'
import type { ComponentNode, LoadResult } from '../types/model'
import { createStandardMaterial } from './colorPalette'

// DXF (AutoCAD exchange, ASCII) - read without any third-party parser: the
// format is a flat list of (group code, value) line pairs. Supported:
// LINE, LWPOLYLINE / POLYLINE (+ bulge arcs), CIRCLE, ARC, ELLIPSE, SPLINE
// (fit points, else control polygon - approximate, flagged in the name),
// 3DFACE (real triangles), and INSERT of BLOCKS (position, scale, rotation,
// nested). TEXT, DIMENSION, HATCH… are skipped (counted in the root name).
// Binary DXF and DWG are not readable here.
//
// The whole app works on triangle meshes (picking, sections, measuring), so
// each drawn curve becomes a thin flat ribbon in its own plane. The ribbon
// is built around its exact centerline: the centerline points are real mesh
// vertices, so vertex snapping during measurement lands on the drawing's
// true coordinates, not on the ribbon's offset edges. Units follow
// $INSUNITS and are converted to millimetres (the app's unit).

type Pair = [number, string]
type Vec = [number, number, number]

interface Entity {
  type: string
  codes: Pair[]
  vertices?: Entity[] // POLYLINE's VERTEX children
}

const UNIT_TO_MM: Record<number, number> = {
  0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100,
}

function readPairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/)
  const pairs: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) throw new Error('DXF illisible (fichier binaire ou corrompu).')
    pairs.push([code, lines[i + 1].trim()])
  }
  return pairs
}

const num = (codes: Pair[], code: number, fallback = 0): number => {
  const p = codes.find((c) => c[0] === code)
  return p ? parseFloat(p[1]) : fallback
}
const str = (codes: Pair[], code: number): string => codes.find((c) => c[0] === code)?.[1] ?? ''

// Splits a section's pairs into entities (each starts at a code-0 pair).
function toEntities(pairs: Pair[]): Entity[] {
  const out: Entity[] = []
  let current: Entity | null = null
  let polyline: Entity | null = null
  for (const [code, value] of pairs) {
    if (code === 0) {
      if (value === 'VERTEX' && polyline) {
        current = { type: value, codes: [] }
        polyline.vertices!.push(current)
        continue
      }
      if (value === 'SEQEND') {
        polyline = null
        current = null
        continue
      }
      current = { type: value, codes: [] }
      if (value === 'POLYLINE') {
        current.vertices = []
        polyline = current
      }
      out.push(current)
    } else if (current) {
      current.codes.push([code, value])
    }
  }
  return out
}

function sections(pairs: Pair[]): Map<string, Pair[]> {
  const result = new Map<string, Pair[]>()
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      const name = pairs[i + 1][1]
      const start = i + 2
      let end = start
      while (end < pairs.length && !(pairs[end][0] === 0 && pairs[end][1] === 'ENDSEC')) end++
      result.set(name, pairs.slice(start, end))
      i = end
    }
  }
  return result
}

// Arc between two polyline vertices from the DXF "bulge" (tan of 1/4 of the
// included angle), sampled into points after `a` (excluding a, including b).
function bulgePoints(a: Vec, b: Vec, bulge: number, out: Vec[]) {
  if (Math.abs(bulge) < 1e-9) {
    out.push(b)
    return
  }
  const theta = 4 * Math.atan(bulge)
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const chord = Math.hypot(dx, dy)
  const radius = chord / (2 * Math.sin(theta / 2))
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const h = radius * Math.cos(theta / 2) // signed distance centre - chord middle
  const cx = mid[0] - (h * dy) / chord
  const cy = mid[1] + (h * dx) / chord
  const start = Math.atan2(a[1] - cy, a[0] - cx)
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 36)))
  for (let i = 1; i <= steps; i++) {
    const t = start + (theta * i) / steps
    out.push(i === steps ? b : [cx + Math.abs(radius) * Math.cos(t), cy + Math.abs(radius) * Math.sin(t), a[2]])
  }
}

function arcPoints(cx: number, cy: number, z: number, r: number, a0: number, a1: number): Vec[] {
  let sweep = a1 - a0
  while (sweep <= 0) sweep += Math.PI * 2
  const steps = Math.max(8, Math.ceil(sweep / (Math.PI / 36)))
  const pts: Vec[] = []
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (sweep * i) / steps
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z])
  }
  return pts
}

interface Drawing {
  polylines: { layer: string; points: Vec[] }[]
  triangles: { layer: string; points: Vec[] }[]
  skipped: Map<string, number>
  approximate: number
}

// Entities -> world-space polylines/triangles through `m` (block inserts).
function collect(entities: Entity[], blocks: Map<string, Entity[]>, m: THREE.Matrix4, d: Drawing, depth: number) {
  const tf = (p: Vec): Vec => {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m)
    return [v.x, v.y, v.z]
  }
  for (const e of entities) {
    const c = e.codes
    const layer = str(c, 8) || '0'
    // Object Coordinate System, only the common mirrored case (normal -Z).
    const ocsFlip = num(c, 230, 1) < 0 ? -1 : 1
    const ocs = (x: number, y: number, z: number): Vec => [x * ocsFlip, y, z * ocsFlip]
    switch (e.type) {
      case 'LINE':
        d.polylines.push({ layer, points: [tf([num(c, 10), num(c, 20), num(c, 30)]), tf([num(c, 11), num(c, 21), num(c, 31)])] })
        break
      case 'LWPOLYLINE': {
        const elevation = num(c, 38)
        const verts: { p: Vec; bulge: number }[] = []
        for (const [code, value] of c) {
          if (code === 10) verts.push({ p: [parseFloat(value), 0, elevation], bulge: 0 })
          else if (code === 20 && verts.length) verts[verts.length - 1].p[1] = parseFloat(value)
          else if (code === 42 && verts.length) verts[verts.length - 1].bulge = parseFloat(value)
        }
        if (verts.length < 2) break
        const closed = (num(c, 70) & 1) === 1
        const pts: Vec[] = [verts[0].p]
        const n = closed ? verts.length : verts.length - 1
        for (let i = 0; i < n; i++) bulgePoints(verts[i].p, verts[(i + 1) % verts.length].p, verts[i].bulge, pts)
        d.polylines.push({ layer, points: pts.map((p) => tf(ocs(...p))) })
        break
      }
      case 'POLYLINE': {
        const flags = num(c, 70)
        if (flags & (16 | 64)) {
          d.skipped.set('POLYLINE (maillage)', (d.skipped.get('POLYLINE (maillage)') ?? 0) + 1)
          break
        }
        const verts = (e.vertices ?? []).map((v) => ({
          p: [num(v.codes, 10), num(v.codes, 20), num(v.codes, 30)] as Vec,
          bulge: num(v.codes, 42),
        }))
        if (verts.length < 2) break
        const closed = (flags & 1) === 1
        const pts: Vec[] = [verts[0].p]
        const n = closed ? verts.length : verts.length - 1
        for (let i = 0; i < n; i++) bulgePoints(verts[i].p, verts[(i + 1) % verts.length].p, verts[i].bulge, pts)
        d.polylines.push({ layer, points: pts.map((p) => tf(flags & 8 ? p : ocs(...p))) })
        break
      }
      case 'CIRCLE':
        d.polylines.push({
          layer,
          points: arcPoints(num(c, 10), num(c, 20), num(c, 30), num(c, 40), 0, Math.PI * 2).map((p) => tf(ocs(...p))),
        })
        break
      case 'ARC':
        d.polylines.push({
          layer,
          points: arcPoints(num(c, 10), num(c, 20), num(c, 30), num(c, 40), THREE.MathUtils.degToRad(num(c, 50)), THREE.MathUtils.degToRad(num(c, 51))).map((p) => tf(ocs(...p))),
        })
        break
      case 'ELLIPSE': {
        const center = new THREE.Vector3(num(c, 10), num(c, 20), num(c, 30))
        const major = new THREE.Vector3(num(c, 11), num(c, 21), num(c, 31))
        const normal = new THREE.Vector3(num(c, 210), num(c, 220), num(c, 230, 1)).normalize()
        const minor = normal.clone().cross(major).multiplyScalar(num(c, 40, 1))
        const t0 = num(c, 41)
        let t1 = num(c, 42, Math.PI * 2)
        if (t1 <= t0) t1 += Math.PI * 2
        const steps = Math.max(16, Math.ceil((t1 - t0) / (Math.PI / 36)))
        const pts: Vec[] = []
        for (let i = 0; i <= steps; i++) {
          const t = t0 + ((t1 - t0) * i) / steps
          const p = center.clone().addScaledVector(major, Math.cos(t)).addScaledVector(minor, Math.sin(t))
          pts.push(tf([p.x, p.y, p.z]))
        }
        d.polylines.push({ layer, points: pts })
        break
      }
      case 'SPLINE': {
        const fit: Vec[] = []
        const ctrl: Vec[] = []
        for (let i = 0; i < c.length; i++) {
          const [code, value] = c[i]
          if (code === 11) fit.push([parseFloat(value), num(c.slice(i), 21), num(c.slice(i), 31)])
          if (code === 10) ctrl.push([parseFloat(value), num(c.slice(i), 20), num(c.slice(i), 30)])
        }
        const pts = fit.length >= 2 ? fit : ctrl
        if (pts.length < 2) break
        if (fit.length < 2) d.approximate++
        d.polylines.push({ layer, points: pts.map(tf) })
        break
      }
      case '3DFACE': {
        const q: Vec[] = [0, 1, 2, 3].map((k) => tf([num(c, 10 + k), num(c, 20 + k), num(c, 30 + k)]))
        d.triangles.push({ layer, points: [q[0], q[1], q[2]] })
        if (q[3].some((v, i) => Math.abs(v - q[2][i]) > 1e-9)) d.triangles.push({ layer, points: [q[0], q[2], q[3]] })
        break
      }
      case 'INSERT': {
        const block = blocks.get(str(c, 2))
        if (!block || depth > 16) break
        const local = new THREE.Matrix4().compose(
          new THREE.Vector3(num(c, 10), num(c, 20), num(c, 30)),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(num(c, 50))),
          new THREE.Vector3(num(c, 41, 1), num(c, 42, 1), num(c, 43, 1)),
        )
        collect(block, blocks, m.clone().multiply(local), d, depth + 1)
        break
      }
      case 'POINT':
        break
      default:
        d.skipped.set(e.type, (d.skipped.get(e.type) ?? 0) + 1)
    }
  }
}

// Flat ribbon around a polyline: per segment, centerline a/b plus the two
// offset sides (width w) - 4 triangles sharing the exact centerline vertices.
function ribbon(points: Vec[], w: number, positions: number[], indices: number[]) {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = new THREE.Vector3(...points[i])
    const b = new THREE.Vector3(...points[i + 1])
    const dir = b.clone().sub(a)
    if (dir.lengthSq() < 1e-18) continue
    const side = new THREE.Vector3(-dir.y, dir.x, 0)
    if (side.lengthSq() < 1e-18) side.set(1, 0, 0) // segment along Z
    side.normalize().multiplyScalar(w / 2)
    const base = positions.length / 3
    for (const v of [a, b, a.clone().add(side), b.clone().add(side), a.clone().sub(side), b.clone().sub(side)]) {
      positions.push(v.x, v.y, v.z)
    }
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2, base, base + 4, base + 5, base, base + 5, base + 1)
  }
}

export async function loadDxfFile(file: File): Promise<LoadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder('ascii').decode(bytes.subarray(0, 22)).startsWith('AutoCAD Binary DXF')) {
    throw new Error('DXF binaire non pris en charge : réenregistrez-le en DXF ASCII.')
  }
  const pairs = readPairs(new TextDecoder('utf-8').decode(bytes))
  const secs = sections(pairs)

  const header = secs.get('HEADER') ?? []
  let unitCode = 4
  for (let i = 0; i < header.length; i++) {
    if (header[i][0] === 9 && header[i][1] === '$INSUNITS') unitCode = parseInt(header[i + 1]?.[1] ?? '4', 10)
  }
  const scale = UNIT_TO_MM[unitCode] ?? 1

  const blocks = new Map<string, Entity[]>()
  const blockEntities = toEntities(secs.get('BLOCKS') ?? [])
  let currentBlock: string | null = null
  for (const e of blockEntities) {
    if (e.type === 'BLOCK') {
      currentBlock = str(e.codes, 2)
      blocks.set(currentBlock, [])
    } else if (e.type === 'ENDBLK') currentBlock = null
    else if (currentBlock) blocks.get(currentBlock)!.push(e)
  }

  const drawing: Drawing = { polylines: [], triangles: [], skipped: new Map(), approximate: 0 }
  collect(toEntities(secs.get('ENTITIES') ?? []), blocks, new THREE.Matrix4().makeScale(scale, scale, scale), drawing, 0)
  if (drawing.polylines.length === 0 && drawing.triangles.length === 0) {
    throw new Error('DXF : aucune entité géométrique lisible (lignes, arcs, cercles, polylignes…).')
  }

  // Ribbon width: 0.2 % of the drawing's diagonal, so lines read at any scale.
  const bounds = new THREE.Box3()
  for (const pl of [...drawing.polylines, ...drawing.triangles]) for (const p of pl.points) bounds.expandByPoint(new THREE.Vector3(...p))
  const width = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.002, 1e-3)

  const layers = new Map<string, { positions: number[]; indices: number[] }>()
  const bucket = (layer: string) => {
    if (!layers.has(layer)) layers.set(layer, { positions: [], indices: [] })
    return layers.get(layer)!
  }
  for (const pl of drawing.polylines) {
    const b = bucket(pl.layer)
    ribbon(pl.points, width, b.positions, b.indices)
  }
  for (const tri of drawing.triangles) {
    const b = bucket(tri.layer)
    const base = b.positions.length / 3
    for (const p of tri.points) b.positions.push(...p)
    b.indices.push(base, base + 1, base + 2)
  }

  const group = new THREE.Group()
  const children: ComponentNode[] = []
  let triangleCount = 0
  let id = 1
  for (const [layer, data] of layers) {
    if (data.indices.length === 0) continue
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    geometry.setIndex(data.indices)
    geometry.computeVertexNormals()
    const material = createStandardMaterial()
    material.side = THREE.DoubleSide // flat drawing: visible from both sides
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `Calque ${layer}`
    mesh.userData.primaryMaterial = material
    group.add(mesh)
    triangleCount += data.indices.length / 3
    children.push({ id: `n${id++}`, name: mesh.name, mesh, children: [] })
  }

  const notes: string[] = []
  if (drawing.approximate) notes.push(`${drawing.approximate} spline(s) approchée(s)`)
  const skipped = [...drawing.skipped].map(([t, n]) => `${n} ${t}`)
  if (skipped.length) notes.push(`non affiché : ${skipped.join(', ')}`)
  const rootName = notes.length ? `${file.name} (${notes.join(' ; ')})` : file.name
  const tree: ComponentNode =
    children.length === 1 ? { ...children[0], id: 'n0', name: rootName } : { id: 'n0', name: rootName, mesh: null, children }

  return { object: group, triangleCount, tree }
}
