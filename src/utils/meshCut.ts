import earcut from 'earcut'

// Coupe d'un maillage triangulaire (soupe de triangles, Z vers le haut) en
// tronçons horizontaux FERMÉS : chaque tronçon reçoit ses parois découpées
// plus un couvercle plan à chaque plan de coupe, de sorte que le STL obtenu
// est étanche et imprimable tel quel.
//
// Convention de côté : un sommet est « au-dessus » d'un plan z = c quand
// z >= c. Le tronçon k garde la région zlo <= z < zhi, donc deux tronçons
// voisins se partagent EXACTEMENT les mêmes points sur leur plan commun (les
// intersections arête/plan sont calculées dans un ordre canonique des deux
// extrémités, donc identiques au bit près quel que soit le triangle voisin qui
// les produit). C'est ce qui garantit des arêtes appariées, donc un maillage
// sans trou.

export interface SlicePiece {
  // Triangles (9 nombres chacun), même repère que l'entrée.
  positions: number[]
  min: [number, number, number]
  max: [number, number, number]
  triangleCount: number
}

export interface SliceResult {
  pieces: SlicePiece[]
  // Contours de coupe qui ne se referment pas (maillage source non étanche) :
  // le couvercle correspondant est incomplet.
  openLoops: number
  // Alvéoles d'emboîtement posées (option `joint`) et nombre de plans où elles
  // n'ont pas pu l'être (section trop mince, tronçon trop court).
  joints: JointPlan[]
  jointMisses: number
  // Forme de broche réellement retenue (réduite / allongée si la section est mince).
  usedShape: PinShape | null
}

// Point d'intersection de l'arête [a,b] avec le plan z = c, calculé depuis
// l'extrémité canonique (z, puis x, puis y les plus petits) pour que les deux
// triangles qui partagent l'arête obtiennent le même résultat.
function intersect(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  c: number,
  out: number[],
) {
  let swap = false
  if (bz < az) swap = true
  else if (bz === az) {
    if (bx < ax) swap = true
    else if (bx === ax && by < ay) swap = true
  }
  const [x0, y0, z0, x1, y1, z1] = swap ? [bx, by, bz, ax, ay, az] : [ax, ay, az, bx, by, bz]
  const t = z1 === z0 ? 0 : (c - z0) / (z1 - z0)
  out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)
}

// Sutherland–Hodgman contre un demi-espace z >= c (keepAbove) ou z < c.
function clipPolygon(poly: number[], c: number, keepAbove: boolean): number[] {
  const n = poly.length / 3
  if (n === 0) return poly
  const out: number[] = []
  const inside = (z: number) => (keepAbove ? z >= c : z < c)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = poly[i * 3], ay = poly[i * 3 + 1], az = poly[i * 3 + 2]
    const bx = poly[j * 3], by = poly[j * 3 + 1], bz = poly[j * 3 + 2]
    const ia = inside(az)
    const ib = inside(bz)
    if (ia) out.push(ax, ay, az)
    if (ia !== ib) intersect(ax, ay, az, bx, by, bz, c, out)
  }
  return out
}

interface Segment {
  ax: number
  ay: number
  bx: number
  by: number
}

const KEY_SCALE = 1e5
const keyOf = (x: number, y: number) => `${Math.round(x * KEY_SCALE)}_${Math.round(y * KEY_SCALE)}`

// Chaîne les segments de coupe en contours fermés (sommets de degré 2).
function chainLoops(segments: Segment[]): { loops: [number, number][][]; open: number } {
  const points = new Map<string, [number, number]>()
  const adjacency = new Map<string, string[]>()
  for (const s of segments) {
    const ak = keyOf(s.ax, s.ay)
    const bk = keyOf(s.bx, s.by)
    if (ak === bk) continue
    if (!points.has(ak)) points.set(ak, [s.ax, s.ay])
    if (!points.has(bk)) points.set(bk, [s.bx, s.by])
    let la = adjacency.get(ak)
    if (!la) adjacency.set(ak, (la = []))
    let lb = adjacency.get(bk)
    if (!lb) adjacency.set(bk, (lb = []))
    la.push(bk)
    lb.push(ak)
  }
  const visited = new Set<string>()
  const loops: [number, number][][] = []
  let open = 0
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue
    const chain: string[] = [start]
    visited.add(start)
    let prev = ''
    let current = start
    let closed = false
    let broken = false
    for (;;) {
      const nb = adjacency.get(current)!
      if (nb.length !== 2) {
        broken = true
        break
      }
      const next: string = nb[0] !== prev ? nb[0] : nb[1]
      // Deux voisins identiques (segment aller-retour) : contour dégénéré.
      if (nb[0] === nb[1] && chain.length > 1) {
        broken = true
        break
      }
      if (next === start) {
        closed = true
        break
      }
      if (visited.has(next)) {
        broken = true
        break
      }
      visited.add(next)
      chain.push(next)
      prev = current
      current = next
    }
    if (closed && !broken && chain.length >= 3) loops.push(chain.map((k) => points.get(k)!))
    else open++
  }
  return { loops, open }
}

function signedArea(ring: [number, number][]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Triangule l'intérieur des contours. La profondeur d'imbrication décide du
// rôle : profondeur paire = paroi extérieure, impaire = trou. Cela gère un
// assemblage (un arbre dans l'alésage d'un moyeu : contour dans un trou dans un
// contour) là où un simple « le plus grand contour est l'extérieur » se
// tromperait. `up` = normale voulue des triangles (+1 couvercle du haut, -1 du
// bas) ; earcut ne garantit pas le sens, on le corrige triangle par triangle.
function capTriangles(loops: [number, number][][], z: number, up: 1 | -1, out: number[]) {
  const infos = loops.map((ring) => {
    const [sx, sy] = ring[0]
    return { ring, area: Math.abs(signedArea(ring)), sx, sy, depth: 0, parent: -1 }
  })
  // Le plus petit contour englobant direct = parent ; profondeur = nb d'englobants.
  for (let i = 0; i < infos.length; i++) {
    let parent = -1
    for (let j = 0; j < infos.length; j++) {
      if (i === j || infos[j].area <= infos[i].area) continue
      if (pointInRing(infos[i].sx, infos[i].sy, infos[j].ring)) {
        infos[i].depth++
        if (parent < 0 || infos[j].area < infos[parent].area) parent = j
      }
    }
    infos[i].parent = parent
  }
  infos.forEach((outer, oi) => {
    if (outer.depth % 2 !== 0) return
    const holes = infos.filter((h) => h.parent === oi && h.depth === outer.depth + 1)
    const flat: number[] = []
    const holeStarts: number[] = []
    for (const [x, y] of outer.ring) flat.push(x, y)
    for (const h of holes) {
      holeStarts.push(flat.length / 2)
      for (const [x, y] of h.ring) flat.push(x, y)
    }
    const tri = earcut(flat, holeStarts.length ? holeStarts : undefined, 2)
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2]
      const ax = flat[a * 2], ay = flat[a * 2 + 1]
      const bx = flat[b * 2], by = flat[b * 2 + 1]
      const cx = flat[c * 2], cy = flat[c * 2 + 1]
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (cross === 0) continue
      if (cross > 0 === (up === 1)) out.push(ax, ay, z, bx, by, z, cx, cy, z)
      else out.push(ax, ay, z, cx, cy, z, bx, by, z)
    }
  })
}

// ---------------------------------------------------------------------------
// Emboîtement par broches rectangulaires (carrées si la section le permet) : sur
// chaque plan de coupe, des alvéoles identiques sont creusées dans les faces en
// regard, et des broches (STL séparé, imprimées à plat) les relient. Un profil
// non rond bloque la rotation autour de l'axe de coupe. Une pale est une lame
// mince : l'alvéole est un MÉPLAT allongé dans le sens de la corde (orientation
// tirée de la forme de la section) quand un carré ne tient pas.
// ---------------------------------------------------------------------------

export interface JointOptions {
  pins: number
  // Côté (largeur) souhaité de la broche, mm. Réduit automatiquement si la
  // section est trop mince.
  size: number
  // Jeu par côté entre broche et alvéole (mm).
  clearance: number
  // Profondeur d'alvéole dans chaque tronçon (mm).
  depth: number
  // Paroi minimale entre alvéole et peau extérieure (mm).
  wall: number
}

export interface JointPlan {
  plane: number
  centers: [number, number][]
  depth: number
  // Demi-largeur et demi-longueur de l'alvéole (broche + jeu), et angle (rad)
  // de sa longueur dans le plan XY.
  hw: number
  hl: number
  angle: number
}

// Forme de broche retenue (mm).
export interface PinShape {
  w: number
  l: number
}

type Loops = [number, number][][]

// Contours de la section aux altitudes `zs` (une seule passe sur le maillage).
function sectionLoops(soup: ArrayLike<number>, zs: number[]): Loops[] {
  const order = zs.map((z, i) => ({ z, i })).sort((a, b) => a.z - b.z)
  const sorted = order.map((o) => o.z)
  const segs: Segment[][] = zs.map(() => [])
  const tmp: number[] = []
  const triCount = Math.floor(soup.length / 9)
  for (let t = 0; t < triCount; t++) {
    const o = t * 9
    const ax = soup[o], ay = soup[o + 1], az = soup[o + 2]
    const bx = soup[o + 3], by = soup[o + 4], bz = soup[o + 5]
    const cx = soup[o + 6], cy = soup[o + 7], cz = soup[o + 8]
    const zmin = Math.min(az, bz, cz)
    const zmax = Math.max(az, bz, cz)
    // Premier plan strictement au-dessus de zmin (dichotomie).
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] <= zmin) lo = mid + 1
      else hi = mid
    }
    for (let k = lo; k < sorted.length && sorted[k] <= zmax; k++) {
      const c = sorted[k]
      tmp.length = 0
      if (az >= c !== bz >= c) intersect(ax, ay, az, bx, by, bz, c, tmp)
      if (bz >= c !== cz >= c) intersect(bx, by, bz, cx, cy, cz, c, tmp)
      if (cz >= c !== az >= c) intersect(cx, cy, cz, ax, ay, az, c, tmp)
      if (tmp.length === 6) segs[order[k].i].push({ ax: tmp[0], ay: tmp[1], bx: tmp[3], by: tmp[4] })
    }
  }
  return segs.map((s) => chainLoops(s).loops)
}

// Distance d'un point au contour le plus proche s'il est DANS la matière
// (parité paire/impaire, donc trous et assemblages corrects), sinon -1.
function insideMargin(loops: Loops, x: number, y: number): number {
  let inside = false
  let best = Infinity
  for (const ring of loops) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      const dx = xj - xi, dy = yj - yi
      const l2 = dx * dx + dy * dy
      const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / l2))
      const px = xi + u * dx - x, py = yi + u * dy - y
      const d2 = px * px + py * py
      if (d2 < best) best = d2
    }
  }
  return inside ? Math.sqrt(best) : -1
}

// Direction principale (angle) de la section : axe de plus grande dispersion
// des points du contour. Pour une pale, c'est le sens de la corde.
function principalAngle(loops: Loops): number {
  let n = 0, mx = 0, my = 0
  for (const ring of loops) for (const [x, y] of ring) { n++; mx += x; my += y }
  if (n === 0) return 0
  mx /= n
  my /= n
  let sxx = 0, syy = 0, sxy = 0
  for (const ring of loops) for (const [x, y] of ring) {
    sxx += (x - mx) * (x - mx)
    syy += (y - my) * (y - my)
    sxy += (x - mx) * (y - my)
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy)
}

const PROBE_STEPS = 3

// Prépare le sondage de la section de chaque plan (une passe sur le maillage),
// puis renvoie une fonction qui pose les alvéoles pour une forme de broche.
function prepareJoints(soup: ArrayLike<number>, planes: number[], capLoops: Loops[], zTop: number, opt: JointOptions) {
  const steps = PROBE_STEPS
  // Altitudes sondées de part et d'autre de chaque plan : la pale vrille, donc
  // une alvéole droite doit rester dans la matière sur TOUTE sa profondeur.
  const probeZ: number[] = []
  const probes = planes.map((c, j) => {
    const below = c - (j === 0 ? 0 : planes[j - 1])
    const above = (j === planes.length - 1 ? zTop : planes[j + 1]) - c
    const maxDepth = Math.max(0, Math.min(opt.depth, 0.45 * Math.min(below, above)))
    const s = maxDepth / steps
    for (let i = -steps; i <= steps; i++) probeZ.push(c + i * s)
    return { s, maxDepth }
  })
  const allLoops = sectionLoops(soup, probeZ)
  const angles = capLoops.map((l) => principalAngle(l))

  return (shape: PinShape, wall: number): { plans: JointPlan[]; misses: number } => {
    const hw = shape.w / 2 + opt.clearance
    const hl = shape.l / 2 + opt.clearance
    const plans: JointPlan[] = []
    let misses = 0
    planes.forEach((_, j) => {
      const { s, maxDepth } = probes[j]
      const base = capLoops[j]
      if (maxDepth < 3 || !base || base.length === 0) {
        misses++
        return
      }
      const angle = angles[j]
      const ca = Math.cos(angle), sa = Math.sin(angle)
      // Points de contrôle du rectangle (coins, milieux des côtés, centre).
      const local: [number, number][] = [
        [-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [0, -hw], [0, hw], [-hl, 0], [hl, 0], [0, 0],
      ]
      const levels = (i: number) => allLoops[j * (2 * steps + 1) + steps + i]
      const rectMargin = (cx: number, cy: number, loops: Loops) => {
        let worst = Infinity
        for (const [lx, ly] of local) {
          const m = insideMargin(loops, cx + lx * ca - ly * sa, cy + lx * sa + ly * ca)
          if (m < worst) worst = m
          if (worst < wall) return worst
        }
        return worst
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const ring of base) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      const G = 32
      const cands: { x: number; y: number; m: number[] }[] = []
      for (let a = 0; a <= G; a++) {
        for (let b = 0; b <= G; b++) {
          const x = minX + ((maxX - minX) * a) / G
          const y = minY + ((maxY - minY) * b) / G
          if (rectMargin(x, y, base) >= wall) cands.push({ x, y, m: [] })
        }
      }
      const marginUpTo = (cd: { x: number; y: number; m: number[] }, levelsNeeded: number) => {
        let worst = Infinity
        for (let i = -levelsNeeded; i <= levelsNeeded; i++) {
          const idx = i + steps
          if (cd.m[idx] === undefined) cd.m[idx] = rectMargin(cd.x, cd.y, levels(i))
          worst = Math.min(worst, cd.m[idx])
          if (worst < wall) break
        }
        return worst
      }
      let best: { centers: [number, number][]; depth: number } | null = null
      for (const frac of [1, 0.75, 0.5, 0.34]) {
        const d = maxDepth * frac
        if (d < 3) break
        const lv = Math.min(steps, Math.ceil(d / s - 1e-9))
        const valid = cands
          .map((cd) => ({ cd, m: marginUpTo(cd, lv) }))
          .filter((v) => v.m >= wall)
          .sort((p, q) => q.m - p.m)
        if (valid.length === 0) continue
        const chosen: [number, number][] = [[valid[0].cd.x, valid[0].cd.y]]
        // Broches suivantes : le plus loin possible des précédentes.
        while (chosen.length < opt.pins) {
          let pick: { x: number; y: number } | null = null
          let pickDist = 0
          for (const v of valid) {
            const dist = Math.min(...chosen.map(([x, y]) => Math.hypot(v.cd.x - x, v.cd.y - y)))
            if (dist >= 2 * hl + 2 * hw && dist > pickDist) {
              pick = v.cd
              pickDist = dist
            }
          }
          if (!pick) break
          chosen.push([pick.x, pick.y])
        }
        if (!best || chosen.length > best.centers.length) best = { centers: chosen, depth: d }
        if (chosen.length >= opt.pins) break
      }
      if (!best || best.centers.length < Math.min(2, opt.pins)) misses++
      if (best) plans.push({ plane: j, centers: best.centers, depth: best.depth, hw, hl, angle })
    })
    return { plans, misses }
  }
}

// Pose les alvéoles : essaie d'abord la broche demandée (carrée), puis des
// méplats de plus en plus fins et allongés. Retient la première forme qui
// convient à TOUS les plans (une seule forme de broche pour tout le zip), sinon
// celle qui laisse le moins de plans sans emboîtement.
function planJoints(soup: ArrayLike<number>, planes: number[], capLoops: Loops[], zTop: number, opt: JointOptions) {
  const place = prepareJoints(soup, planes, capLoops, zTop, opt)
  const shapes: { shape: PinShape; wall: number }[] = []
  for (let w = opt.size; w >= 1.5 - 1e-9; w = +(w * 0.8).toFixed(2)) {
    for (const k of [4, 3, 2, 1]) shapes.push({ shape: { w, l: +(w * k).toFixed(2) }, wall: w === opt.size ? opt.wall : Math.min(opt.wall, 0.8) })
  }
  let best: { plans: JointPlan[]; misses: number; shape: PinShape } | null = null
  for (const { shape, wall } of shapes) {
    const r = place(shape, wall)
    if (!best || r.misses < best.misses) best = { ...r, shape }
    if (r.misses === 0) break
  }
  return best ?? { plans: [] as JointPlan[], misses: planes.length, shape: { w: opt.size, l: opt.size } }
}

export function pocketRing(cx: number, cy: number, hw: number, hl: number, angle: number): [number, number][] {
  const ca = Math.cos(angle), sa = Math.sin(angle)
  const pts: [number, number][] = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]
  return pts.map(([lx, ly]) => [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca])
}

// Parois + fond d'une alvéole creusée dans un tronçon. `dir` = -1 : le tronçon
// est SOUS le plan (l'alvéole descend), +1 : au-dessus (elle monte). Les faces
// regardent vers l'intérieur de la cavité.
function pocketTriangles(ring: [number, number][], z: number, depth: number, dir: 1 | -1, out: number[]) {
  const zf = z + dir * depth
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % 4]
    if (dir === -1) out.push(ax, ay, z, bx, by, z, bx, by, zf, ax, ay, z, bx, by, zf, ax, ay, zf)
    else out.push(ax, ay, z, bx, by, zf, bx, by, z, ax, ay, z, ax, ay, zf, bx, by, zf)
  }
  const [p0, p1, p2, p3] = ring
  if (dir === -1) out.push(p0[0], p0[1], zf, p1[0], p1[1], zf, p2[0], p2[1], zf, p0[0], p0[1], zf, p2[0], p2[1], zf, p3[0], p3[1], zf)
  else out.push(p0[0], p0[1], zf, p2[0], p2[1], zf, p1[0], p1[1], zf, p0[0], p0[1], zf, p3[0], p3[1], zf, p2[0], p2[1], zf)
}

// Découpe `soup` (triangles, 9 nombres chacun) par les plans z = planes[i]
// (croissants). Renvoie planes.length + 1 tronçons (du bas vers le haut).
export function sliceSoup(
  soup: Float32Array | number[],
  planes: number[],
  withCaps: boolean,
  joint?: JointOptions | null,
): SliceResult {
  const nPieces = planes.length + 1
  const pieces: SlicePiece[] = Array.from({ length: nPieces }, () => ({
    positions: [],
    min: [Infinity, Infinity, Infinity] as [number, number, number],
    max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
    triangleCount: 0,
  }))
  const capSegments: Segment[][] = planes.map(() => [])

  const grow = (piece: SlicePiece, x: number, y: number, z: number) => {
    if (x < piece.min[0]) piece.min[0] = x
    if (y < piece.min[1]) piece.min[1] = y
    if (z < piece.min[2]) piece.min[2] = z
    if (x > piece.max[0]) piece.max[0] = x
    if (y > piece.max[1]) piece.max[1] = y
    if (z > piece.max[2]) piece.max[2] = z
  }

  // Tronçon d'un z donné : nombre de plans <= z (recherche dichotomique).
  const pieceIndexAt = (z: number) => {
    let lo = 0
    let hi = planes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (planes[mid] <= z) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const triCount = Math.floor(soup.length / 9)
  const tmp: number[] = []
  for (let t = 0; t < triCount; t++) {
    const o = t * 9
    const ax = soup[o], ay = soup[o + 1], az = soup[o + 2]
    const bx = soup[o + 3], by = soup[o + 4], bz = soup[o + 5]
    const cx = soup[o + 6], cy = soup[o + 7], cz = soup[o + 8]
    const zmin = Math.min(az, bz, cz)
    const zmax = Math.max(az, bz, cz)
    const k0 = pieceIndexAt(zmin)
    const k1 = pieceIndexAt(zmax)

    if (k0 === k1) {
      const p = pieces[k0]
      p.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
      p.triangleCount++
      grow(p, ax, ay, az)
      grow(p, bx, by, bz)
      grow(p, cx, cy, cz)
      continue
    }

    for (let k = k0; k <= k1; k++) {
      let poly = [ax, ay, az, bx, by, bz, cx, cy, cz]
      if (k > 0) poly = clipPolygon(poly, planes[k - 1], true)
      if (k < planes.length) poly = clipPolygon(poly, planes[k], false)
      const n = poly.length / 3
      if (n < 3) continue
      const p = pieces[k]
      for (let i = 1; i < n - 1; i++) {
        const i0 = 0, i1 = i * 3, i2 = (i + 1) * 3
        // Triangle dégénéré (aire nulle) : sans effet sur la surface, on l'ignore.
        const ux = poly[i1] - poly[i0], uy = poly[i1 + 1] - poly[i0 + 1], uz = poly[i1 + 2] - poly[i0 + 2]
        const vx = poly[i2] - poly[i0], vy = poly[i2 + 1] - poly[i0 + 1], vz = poly[i2 + 2] - poly[i0 + 2]
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        if (nx === 0 && ny === 0 && nz === 0) continue
        p.positions.push(
          poly[i0], poly[i0 + 1], poly[i0 + 2],
          poly[i1], poly[i1 + 1], poly[i1 + 2],
          poly[i2], poly[i2 + 1], poly[i2 + 2],
        )
        p.triangleCount++
        for (const idx of [i0, i1, i2]) grow(p, poly[idx], poly[idx + 1], poly[idx + 2])
      }
    }

    if (!withCaps) continue
    // Segments de coupe : pour chaque plan traversé par ce triangle.
    for (let j = k0; j < k1; j++) {
      const c = planes[j]
      const da = az >= c, db = bz >= c, dc = cz >= c
      tmp.length = 0
      if (da !== db) intersect(ax, ay, az, bx, by, bz, c, tmp)
      if (db !== dc) intersect(bx, by, bz, cx, cy, cz, c, tmp)
      if (dc !== da) intersect(cx, cy, cz, ax, ay, az, c, tmp)
      if (tmp.length === 6) capSegments[j].push({ ax: tmp[0], ay: tmp[1], bx: tmp[3], by: tmp[4] })
    }
  }

  let openLoops = 0
  let joints: JointPlan[] = []
  let jointMisses = 0
  let usedShape: PinShape | null = null
  if (withCaps) {
    const capLoops: Loops[] = planes.map((_, j) => {
      const { loops, open } = chainLoops(capSegments[j])
      openLoops += open
      return loops
    })
    if (joint && planes.length > 0) {
      const zTop = Math.max(...pieces.map((p) => p.max[2]))
      const r = planJoints(soup, planes, capLoops, zTop, joint)
      joints = r.plans
      jointMisses = r.misses
      usedShape = joints.length ? r.shape : null
    }
    planes.forEach((c, j) => {
      const loops = capLoops[j]
      const plan = joints.find((p) => p.plane === j)
      // Les alvéoles sont des trous supplémentaires dans le couvercle (leur
      // profondeur d'imbrication impaire en fait des trous de la paroi extérieure).
      const pockets = plan ? plan.centers.map(([x, y]) => pocketRing(x, y, plan.hw, plan.hl, plan.angle)) : []
      const withPockets = loops.concat(pockets)
      // Un même contour sert aux deux tronçons voisins (normales opposées).
      capTriangles(withPockets, c, 1, pieces[j].positions)
      capTriangles(withPockets, c, -1, pieces[j + 1].positions)
      if (plan) {
        for (const [x, y] of plan.centers) {
          const ring = pocketRing(x, y, plan.hw, plan.hl, plan.angle)
          pocketTriangles(ring, c, plan.depth, -1, pieces[j].positions)
          pocketTriangles(ring, c, plan.depth, 1, pieces[j + 1].positions)
        }
      }
      for (const piece of [pieces[j], pieces[j + 1]]) {
        for (const ring of loops) for (const [x, y] of ring) grow(piece, x, y, c)
      }
    })
    for (const p of pieces) p.triangleCount = p.positions.length / 9
  }

  return { pieces, openLoops, joints, jointMisses, usedShape }
}
