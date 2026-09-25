import * as THREE from 'three'
import type { ComponentNode, LoadResult } from '../types/model'
import { STEP_QUALITY_PARAMS, useStepQualityStore } from './stepQuality'
import { createStandardMaterial } from './colorPalette'
import { readMeshCache, writeMeshCache } from './meshCache'
import { identifyParts } from './partIdentity'
import { sewSurfaces } from './surfaceSewing'

interface WorkerMeshResult {
  name: string
  color: [number, number, number] | null
  position: Float32Array
  normal: Float32Array | null
  index: Uint32Array
  brepFaces: { first: number; last: number }[]
}

interface WorkerTreeNode {
  name: string
  meshes: number[]
  children: WorkerTreeNode[]
}

// What the worker produces, and what the persistent cache stores.
export interface ParsedStep {
  meshes: WorkerMeshResult[]
  root: WorkerTreeNode | null
}

interface WorkerResponse {
  success: boolean
  error?: string
  meshes?: WorkerMeshResult[]
  root?: WorkerTreeNode | null
}

// B-Rep exchange formats read by the occt-import-js worker (see step.worker.js).
export type OcctFormat = 'step' | 'iges' | 'brep'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/step.worker.js', import.meta.url), {
      type: 'classic',
    })
  }
  return worker
}

function buildTree(
  raw: WorkerTreeNode,
  meshObjects: THREE.Mesh[],
  fallbackName: string,
  nextId: () => string,
): ComponentNode {
  const id = nextId()
  const name = raw.name || fallbackName
  const ownMeshes = (raw.meshes ?? []).map((i) => meshObjects[i]).filter(Boolean)
  const childNodes = (raw.children ?? []).map((child) => buildTree(child, meshObjects, 'Composant', nextId))

  if (ownMeshes.length === 1 && childNodes.length === 0) {
    return { id, name, mesh: ownMeshes[0], children: [] }
  }

  const meshLeaves: ComponentNode[] = ownMeshes.map((mesh, i) => ({
    id: `${id}-m${i}`,
    name: ownMeshes.length > 1 ? mesh.name || `${name} (${i + 1})` : name,
    mesh,
    children: [],
  }))

  return { id, name, mesh: null, children: [...meshLeaves, ...childNodes] }
}

// Turns parsed worker data (fresh from the worker or restored from the cache)
// into the Three.js scene objects and component tree.
function buildLoadResult(data: ParsedStep, fileName: string): LoadResult {
  const group = new THREE.Group()
  const meshObjects: THREE.Mesh[] = []
  let triangleCount = 0

  data.meshes.forEach((meshData) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.position, 3))
    if (meshData.normal) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normal, 3))
    } else {
      geometry.computeVertexNormals()
    }
    geometry.setIndex(new THREE.BufferAttribute(meshData.index, 1))

    triangleCount += meshData.index.length / 3

    const material = createStandardMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = meshData.name
    mesh.userData.primaryMaterial = material
    mesh.userData.brepFaces = meshData.brepFaces
    group.add(mesh)
    meshObjects.push(mesh)
  })
  identifyParts(meshObjects)

  let idCounter = 0
  const nextId = () => `n${idCounter++}`

  const tree = data.root
    ? buildTree(data.root, meshObjects, fileName, nextId)
    : ({
        id: nextId(),
        name: fileName,
        mesh: meshObjects.length === 1 ? meshObjects[0] : null,
        children: meshObjects.length === 1 ? [] : meshObjects.map((mesh, i) => ({
          id: `n${i + 1}`,
          name: mesh.name,
          mesh,
          children: [],
        })),
      } satisfies ComponentNode)

  return { object: group, triangleCount, tree }
}

function parseInWorker(file: File, format: OcctFormat): Promise<ParsedStep> {
  return new Promise((resolve, reject) => {
    file
      .arrayBuffer()
      .then((buffer) => {
        const w = getWorker()

        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
          w.removeEventListener('message', handleMessage)
          w.removeEventListener('error', handleError)

          const data = event.data
          if (!data.success || !data.meshes) {
            reject(new Error(data.error || `Échec de la lecture du fichier ${format.toUpperCase()}.`))
            return
          }
          resolve({ meshes: data.meshes, root: data.root ?? null })
        }

        const handleError = (err: ErrorEvent) => {
          w.removeEventListener('message', handleMessage)
          w.removeEventListener('error', handleError)
          reject(new Error(err.message || 'Erreur du worker de lecture OpenCascade.'))
        }

        w.addEventListener('message', handleMessage)
        w.addEventListener('error', handleError)
        // Resolved against the page URL so it's correct for both the absolute
        // web base and the relative Electron base (see step.worker.js).
        const occtBaseUrl = new URL(`${import.meta.env.BASE_URL}occt-import-js/`, window.location.href).href
        const meshParams = STEP_QUALITY_PARAMS[useStepQualityStore.getState().quality]
        w.postMessage({ fileBuffer: buffer, occtBaseUrl, meshParams, format }, [buffer])
      })
      .catch(reject)
  })
}

// `fileHash` (the content hash the loader already computes) keys the persistent
// cache together with the meshing quality: reopening the same file at the same
// quality skips the slow OpenCascade parse entirely.
export async function loadStepFile(file: File, fileHash?: string, format: OcctFormat = 'step'): Promise<LoadResult> {
  const quality = useStepQualityStore.getState().quality
  const cacheKey = fileHash ? `${fileHash}:${quality}` : null

  if (cacheKey) {
    const cached = await readMeshCache<ParsedStep>(cacheKey)
    if (cached) return { ...buildLoadResult(cached, file.name), fromCache: true }
  }

  let parsed = await parseInWorker(file, format)
  // IGES: loose trimmed surfaces -> sewn, consistently oriented bodies (see
  // surfaceSewing.ts). Done before caching so a reopen gets the sewn result.
  if (format === 'iges') parsed = sewSurfaces(parsed, file.name)
  // Stored in the background: the model shows up without waiting for the write.
  if (cacheKey) {
    let bytes = 0
    for (const m of parsed.meshes) bytes += m.position.byteLength + (m.normal?.byteLength ?? 0) + m.index.byteLength
    void writeMeshCache(cacheKey, file.name, bytes, parsed)
  }
  return buildLoadResult(parsed, file.name)
}

// Reopens a model from the persistent cache using only the file's content hash
// - no source file needed. Used to open a .pindi project whose source file is
// not embedded but was opened on this computer before. Tries the current
// quality first, then the others.
export async function loadCachedStep(fileHash: string, fileName: string): Promise<LoadResult | null> {
  const current = useStepQualityStore.getState().quality
  const qualities = [current, ...(['standard', 'fine', 'precise'] as const).filter((q) => q !== current)]
  for (const quality of qualities) {
    const cached = await readMeshCache<ParsedStep>(`${fileHash}:${quality}`)
    if (cached) return { ...buildLoadResult(cached, fileName), fromCache: true }
  }
  return null
}
