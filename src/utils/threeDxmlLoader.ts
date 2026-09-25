import * as THREE from 'three'
import { unzipSync, strFromU8 } from 'fflate'
import type { ComponentNode, LoadResult } from '../types/model'
import { createStandardMaterial } from './colorPalette'
import { identifyParts } from './partIdentity'

// 3DXML (CATIA V6 / 3DEXPERIENCE, also written by SOLIDWORKS "Enregistrer
// sous 3DXML") is a zip of XML files: Manifest.xml names the root product
// file, whose <ProductStructure> links Reference3D parts/assemblies,
// Instance3D placements (RelativeMatrix) and ReferenceRep geometry stored in
// separate .3DRep files. Only the TESSELLATED representation is readable
// here - it is what every exporter writes for viewing; exact B-Rep ("CGR"
// binary, or authoring data) is proprietary and rejected with a clear
// message instead of showing a partial model.
//
// Each .3DRep holds nested PolygonalRep blocks, one vertex buffer each, whose
// <Face> lists triangles/strips/fans as vertex indices ("0 1 2 3,4 5 6" -
// commas separate independent lists). Coordinates are read as a flat list of
// numbers grouped by three, which copes with both separator conventions seen
// in the wild ("x y z,x y z" from SOLIDWORKS, "x,y,z x,y,z" elsewhere).
// Instance transforms are baked into the geometry, like OpenCascade does for
// STEP, so every mesh lives in world coordinates directly under the root
// group - the rest of the app (picking, sections, printing) assumes that.

const NS_FREE = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => c.localName === name)

function numbers(text: string | null | undefined): number[] {
  if (!text) return []
  return text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
}

function indexLists(attr: string | null): number[][] {
  if (!attr || !attr.trim()) return []
  return attr
    .split(',')
    .map((part) => numbers(part))
    .filter((list) => list.length >= 3)
}

// Strip (0 1 2 3 ...) -> triangles with alternating winding so every face
// keeps the same orientation as the strip's first triangle.
function stripToTriangles(strip: number[], out: number[]) {
  for (let i = 0; i + 2 < strip.length; i++) {
    if (i % 2 === 0) out.push(strip[i], strip[i + 1], strip[i + 2])
    else out.push(strip[i + 1], strip[i], strip[i + 2])
  }
}

function fanToTriangles(fan: number[], out: number[]) {
  for (let i = 1; i + 1 < fan.length; i++) out.push(fan[0], fan[i], fan[i + 1])
}

// One PolygonalRep -> one BufferGeometry (or null when it only has edges).
function polygonalRepGeometry(rep: Element): THREE.BufferGeometry | null {
  const vertexBuffer = NS_FREE(rep, 'VertexBuffer')[0]
  const faces = NS_FREE(rep, 'Faces')[0]
  if (!vertexBuffer || !faces) return null

  const positions = numbers(NS_FREE(vertexBuffer, 'Positions')[0]?.textContent)
  const normals = numbers(NS_FREE(vertexBuffer, 'Normals')[0]?.textContent)
  if (positions.length < 9 || positions.length % 3 !== 0) return null

  const indices: number[] = []
  for (const face of NS_FREE(faces, 'Face')) {
    for (const tri of indexLists(face.getAttribute('triangles'))) {
      for (let i = 0; i + 2 < tri.length; i += 3) indices.push(tri[i], tri[i + 1], tri[i + 2])
    }
    for (const strip of indexLists(face.getAttribute('strips'))) stripToTriangles(strip, indices)
    for (const fan of indexLists(face.getAttribute('fans'))) fanToTriangles(fan, indices)
  }
  const vertexCount = positions.length / 3
  if (indices.length === 0 || indices.some((i) => !(i >= 0 && i < vertexCount))) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (normals.length === positions.length) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  }
  geometry.setIndex(indices)
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  return geometry
}

// Every PolygonalRep of a .3DRep file (they can be nested in BagReps), merged
// into one geometry: one part = one mesh, like a STEP solid.
function repFileGeometry(xml: Document): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = []
  for (const rep of Array.from(xml.getElementsByTagName('*'))) {
    if (rep.localName !== 'Rep') continue
    const type = rep.getAttribute('xsi:type') || rep.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')
    if (type !== 'PolygonalRepType') continue
    const geometry = polygonalRepGeometry(rep)
    if (geometry) parts.push(geometry)
  }
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return mergeIndexed(parts)
}

function mergeIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const g of parts) {
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i))
    }
    const idx = g.getIndex()!
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset)
    offset += pos.count
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  merged.setIndex(indices)
  return merged
}

// 3DXML RelativeMatrix: 12 numbers = the three rotation axes (columns) then
// the translation. Missing or malformed -> identity.
function relativeMatrix(el: Element): THREE.Matrix4 {
  const v = numbers(NS_FREE(el, 'RelativeMatrix')[0]?.textContent)
  const m = new THREE.Matrix4()
  if (v.length !== 12) return m
  m.set(v[0], v[3], v[6], v[9], v[1], v[4], v[7], v[10], v[2], v[5], v[8], v[11], 0, 0, 0, 1)
  return m
}

function childText(el: Element, name: string): string | null {
  return NS_FREE(el, name)[0]?.textContent?.trim() ?? null
}

// "urn:3DXML:TessPart_2.3DRep" or "urn:3DXML:Other.3dxml#12" -> archive entry name.
function urnFile(urn: string): string {
  return urn.replace(/^urn:3DXML:/, '').split('#')[0]
}

export async function load3dxmlFile(file: File): Promise<LoadResult> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error("Ce fichier 3DXML n'est pas une archive valide.")
  }
  // Archive names are matched case-insensitively (exporters differ).
  const byLower = new Map(Object.keys(entries).map((k) => [k.toLowerCase(), k]))
  const read = (name: string): Uint8Array | null => {
    const key = byLower.get(name.toLowerCase())
    return key ? entries[key] : null
  }
  const parser = new DOMParser()
  const parseXml = (bytes: Uint8Array): Document | null => {
    // A binary representation (CGR, compressed 3DRep) starts with non-text
    // bytes; it cannot be decoded here.
    if (bytes.length === 0 || bytes.subarray(0, 64).some((b) => b === 0)) return null
    const doc = parser.parseFromString(strFromU8(bytes), 'application/xml')
    return doc.getElementsByTagName('parsererror').length ? null : doc
  }

  const manifest = read('Manifest.xml')
  const manifestDoc = manifest ? parseXml(manifest) : null
  const rootName = manifestDoc?.getElementsByTagName('Root')[0]?.textContent?.trim()
  const rootBytes = rootName ? read(rootName) : null
  const productDoc = rootBytes ? parseXml(rootBytes) : null
  if (!productDoc) throw new Error('3DXML : fichier racine introuvable ou illisible (Manifest.xml).')

  const structure = productDoc.getElementsByTagName('ProductStructure')[0]
  if (!structure) throw new Error('3DXML : aucune structure produit (ProductStructure).')

  const references = new Map<string, Element>()
  const instances: Element[] = []
  const repRefs = new Map<string, Element>()
  const repInstances: Element[] = []
  for (const el of Array.from(structure.children)) {
    const id = el.getAttribute('id') ?? ''
    if (el.localName === 'Reference3D') references.set(id, el)
    else if (el.localName === 'Instance3D') instances.push(el)
    else if (el.localName === 'ReferenceRep') repRefs.set(id, el)
    else if (el.localName === 'InstanceRep') repInstances.push(el)
  }

  const geometryCache = new Map<string, THREE.BufferGeometry | null>()
  let unsupported = 0
  const repGeometry = (repRefId: string): THREE.BufferGeometry | null => {
    if (geometryCache.has(repRefId)) return geometryCache.get(repRefId)!
    const ref = repRefs.get(repRefId)
    let geometry: THREE.BufferGeometry | null = null
    if (ref && (ref.getAttribute('format') ?? '').toUpperCase() === 'TESSELLATED') {
      const bytes = read(urnFile(ref.getAttribute('associatedFile') ?? ''))
      const doc = bytes ? parseXml(bytes) : null
      geometry = doc ? repFileGeometry(doc) : null
    }
    if (!geometry) unsupported++
    geometryCache.set(repRefId, geometry)
    return geometry
  }

  const group = new THREE.Group()
  const meshes: THREE.Mesh[] = []
  let triangleCount = 0
  let idCounter = 0
  const nextId = () => `n${idCounter++}`

  // Depth-first from the root reference, accumulating instance placements.
  const visit = (refId: string, name: string, world: THREE.Matrix4, depth: number): ComponentNode => {
    const node: ComponentNode = { id: nextId(), name, mesh: null, children: [] }
    if (depth > 64) return node // cyclic or absurdly deep structure: stop

    for (const inst of repInstances) {
      if (childText(inst, 'IsAggregatedBy') !== refId) continue
      const geometry = repGeometry(childText(inst, 'IsInstanceOf') ?? '')
      if (!geometry) continue
      const g = geometry.clone().applyMatrix4(world)
      const material = createStandardMaterial()
      const mesh = new THREE.Mesh(g, material)
      mesh.name = name
      mesh.userData.primaryMaterial = material
      group.add(mesh)
      meshes.push(mesh)
      triangleCount += (g.getIndex()?.count ?? 0) / 3
      node.children.push({ id: nextId(), name, mesh, children: [] })
    }
    for (const inst of instances) {
      if (childText(inst, 'IsAggregatedBy') !== refId) continue
      const childRef = childText(inst, 'IsInstanceOf') ?? ''
      const childName =
        inst.getAttribute('name') || references.get(childRef)?.getAttribute('name') || 'Composant'
      const childWorld = world.clone().multiply(relativeMatrix(inst))
      node.children.push(visit(childRef, childName, childWorld, depth + 1))
    }
    // A part holding exactly one body is shown as that body directly.
    if (node.children.length === 1 && node.children[0].mesh) {
      return { ...node.children[0], id: node.id, name }
    }
    return node
  }

  const rootId = structure.getAttribute('root') ?? references.keys().next().value ?? ''
  const rootName3d = references.get(rootId)?.getAttribute('name') || file.name
  const tree = visit(rootId, rootName3d, new THREE.Matrix4(), 0)
  geometryCache.forEach((g) => g?.dispose())

  if (meshes.length === 0) {
    throw new Error(
      unsupported > 0
        ? "3DXML : la géométrie n'est pas stockée sous forme maillée lisible (représentation CGR/binaire ou exacte). " +
            'Réexportez le fichier en 3DXML « maillé » (tessellated).'
        : '3DXML : aucune géométrie trouvée.',
    )
  }
  identifyParts(meshes)
  return { object: group, triangleCount, tree }
}
