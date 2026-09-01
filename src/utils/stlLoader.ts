import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { LoadResult } from '../types/model'
import { createStandardMaterial } from './colorPalette'

export async function loadStlFile(file: File): Promise<LoadResult> {
  const buffer = await file.arrayBuffer()
  const loader = new STLLoader()
  const geometry = loader.parse(buffer)

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals()
  }

  const material = createStandardMaterial()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = file.name
  mesh.userData.primaryMaterial = material

  const group = new THREE.Group()
  group.add(mesh)

  const index = geometry.getIndex()
  const triangleCount = index ? index.count / 3 : geometry.attributes.position.count / 3

  return {
    object: group,
    triangleCount,
    tree: { id: 'n0', name: file.name, mesh, children: [] },
  }
}
