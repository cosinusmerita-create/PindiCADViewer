import * as THREE from 'three'
import type { ComponentNode, LoadResult } from '../types/model'
import { createStandardMaterial, getPaletteColor } from './colorPalette'

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

interface WorkerResponse {
  success: boolean
  error?: string
  meshes?: WorkerMeshResult[]
  root?: WorkerTreeNode | null
}

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

export function loadStepFile(file: File): Promise<LoadResult> {
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
            reject(new Error(data.error || 'Échec du parsing du fichier STEP.'))
            return
          }

          const group = new THREE.Group()
          const meshObjects: THREE.Mesh[] = []
          let triangleCount = 0

          data.meshes.forEach((meshData, i) => {
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
            mesh.name = meshData.name || `Pièce ${i + 1}`
            mesh.userData.primaryMaterial = material
            mesh.userData.brepFaces = meshData.brepFaces
            if (data.meshes!.length > 1) {
              mesh.userData.paletteColor = getPaletteColor(i).getHex()
            }
            group.add(mesh)
            meshObjects.push(mesh)
          })

          let idCounter = 0
          const nextId = () => `n${idCounter++}`

          const tree = data.root
            ? buildTree(data.root, meshObjects, file.name, nextId)
            : ({
                id: nextId(),
                name: file.name,
                mesh: meshObjects.length === 1 ? meshObjects[0] : null,
                children: meshObjects.length === 1 ? [] : meshObjects.map((mesh, i) => ({
                  id: `n${i + 1}`,
                  name: mesh.name,
                  mesh,
                  children: [],
                })),
              } satisfies ComponentNode)

          resolve({ object: group, triangleCount, tree })
        }

        const handleError = (err: ErrorEvent) => {
          w.removeEventListener('message', handleMessage)
          w.removeEventListener('error', handleError)
          reject(new Error(err.message || 'Erreur du worker de parsing STEP.'))
        }

        w.addEventListener('message', handleMessage)
        w.addEventListener('error', handleError)
        w.postMessage({ fileBuffer: buffer }, [buffer])
      })
      .catch(reject)
  })
}
