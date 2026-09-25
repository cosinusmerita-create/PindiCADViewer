import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

// Mesh-vs-mesh collision for the "move with collision" tool. Two stages, the
// standard trade-off: a cheap world-space AABB test rejects most pairs, and
// only overlapping boxes go on to an exact triangle-vs-triangle test through
// three-mesh-bvh. AABBs alone are useless for assemblies (a shaft inside its
// tube always overlaps the tube's box without touching it).

const bvhCache = new WeakMap<THREE.BufferGeometry, MeshBVH>()

function getBvh(geometry: THREE.BufferGeometry): MeshBVH {
  let bvh = bvhCache.get(geometry)
  if (!bvh) {
    bvh = new MeshBVH(geometry)
    bvhCache.set(geometry, bvh)
  }
  return bvh
}

const _inverse = new THREE.Matrix4()
const _bToA = new THREE.Matrix4()

export function meshWorldBox(mesh: THREE.Mesh, target: THREE.Box3): THREE.Box3 {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  return target.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld)
}

// Exact test; both meshes' matrixWorld must be up to date. Touching or
// coplanar-overlapping triangles count as intersecting, which is why callers
// baseline the contacts that already exist (see baselineContacts below).
export function meshesIntersect(a: THREE.Mesh, b: THREE.Mesh): boolean {
  _inverse.copy(a.matrixWorld).invert()
  _bToA.multiplyMatrices(_inverse, b.matrixWorld)
  return getBvh(a.geometry).bvhcast(getBvh(b.geometry), _bToA, {
    intersectsTriangles: (t1, t2) => t1.intersectsTriangle(t2),
  })
}

export interface StaticEntry {
  mesh: THREE.Mesh
  box: THREE.Box3
}

// Snapshot of the parts that stay put during a drag: their boxes never change
// while something else moves, so they're computed once per drag.
export function buildStatics(meshes: THREE.Mesh[], moving: Set<THREE.Mesh>): StaticEntry[] {
  const statics: StaticEntry[] = []
  for (const mesh of meshes) {
    if (moving.has(mesh) || !mesh.visible) continue
    mesh.updateWorldMatrix(true, false)
    statics.push({ mesh, box: meshWorldBox(mesh, new THREE.Box3()) })
  }
  return statics
}

const collisionKey = (a: THREE.Mesh, b: THREE.Mesh) => `${a.uuid}|${b.uuid}`

export type Contact = [THREE.Mesh, THREE.Mesh]

const _box = new THREE.Box3()

// First moving/static pair that intersects, ignoring pairs that were already
// in contact when the drag started (assemblies are full of seated, touching
// parts: only NEW contact should block the move).
export function findContact(moving: THREE.Mesh[], statics: StaticEntry[], ignore: Set<string>): Contact | null {
  for (const m of moving) {
    meshWorldBox(m, _box)
    for (const s of statics) {
      if (!_box.intersectsBox(s.box) || ignore.has(collisionKey(m, s.mesh))) continue
      if (meshesIntersect(m, s.mesh)) return [m, s.mesh]
    }
  }
  return null
}

export function baselineContacts(moving: THREE.Mesh[], statics: StaticEntry[]): Set<string> {
  const ignore = new Set<string>()
  for (const m of moving) {
    meshWorldBox(m, _box)
    for (const s of statics) {
      if (_box.intersectsBox(s.box) && meshesIntersect(m, s.mesh)) ignore.add(collisionKey(m, s.mesh))
    }
  }
  return ignore
}

// All pairs of meshes that currently interpenetrate (the interference check).
export function findAllInterferences(meshes: THREE.Mesh[]): Contact[] {
  const visible = meshes.filter((m) => m.visible)
  const boxes = visible.map((m) => {
    m.updateWorldMatrix(true, false)
    return meshWorldBox(m, new THREE.Box3())
  })
  const pairs: Contact[] = []
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      if (boxes[i].intersectsBox(boxes[j]) && meshesIntersect(visible[i], visible[j])) {
        pairs.push([visible[i], visible[j]])
      }
    }
  }
  return pairs
}

export interface PoseSnapshot {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

export const snapshotPose = (o: THREE.Object3D): PoseSnapshot => ({
  position: o.position.clone(),
  quaternion: o.quaternion.clone(),
})

function setPoseLerp(o: THREE.Object3D, from: PoseSnapshot, to: PoseSnapshot, t: number) {
  o.position.lerpVectors(from.position, to.position, t)
  o.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t)
  o.updateMatrixWorld(true)
}

// Moves `pivot` from `from` toward `to` and stops at the first contact.
// Sampled in small steps (a quarter of the moving group's thinnest side) so a
// fast mouse move can't tunnel through a thin part, then bisected to land on
// the contact point instead of one step short of it. Leaves the pivot at the
// last collision-free pose and returns that pose plus the blocking pair.
export function sweepToContact(
  pivot: THREE.Object3D,
  moving: THREE.Mesh[],
  from: PoseSnapshot,
  to: PoseSnapshot,
  statics: StaticEntry[],
  ignore: Set<string>,
): { pose: PoseSnapshot; contact: Contact | null } {
  const bounds = new THREE.Box3()
  for (const m of moving) bounds.union(meshWorldBox(m, _box))
  const size = bounds.getSize(new THREE.Vector3())
  const minSide = Math.max(Math.min(size.x, size.y, size.z), size.length() * 0.02, 1e-6)
  const angle = from.quaternion.angleTo(to.quaternion)
  const travel = from.position.distanceTo(to.position) + angle * (size.length() / 2)
  const steps = THREE.MathUtils.clamp(Math.ceil(travel / (minSide * 0.25)), 1, 60)

  let free = 0
  let contact: Contact | null = null
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    setPoseLerp(pivot, from, to, t)
    const hit = findContact(moving, statics, ignore)
    if (hit) {
      contact = hit
      let lo = free
      let hi = t
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2
        setPoseLerp(pivot, from, to, mid)
        const midHit = findContact(moving, statics, ignore)
        if (midHit) {
          hi = mid
          contact = midHit
        } else {
          lo = mid
        }
      }
      free = lo
      break
    }
    free = t
  }

  setPoseLerp(pivot, from, to, free)
  return { pose: snapshotPose(pivot), contact }
}
