import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { ComponentNode, LoadResult } from '../types/model'
import { createStandardMaterial } from './colorPalette'
import { identifyParts } from './partIdentity'

export async function loadObjFile(file: File): Promise<LoadResult> {
  const text = await file.text()
  const loader = new OBJLoader()
  const group = loader.parse(text)

  const meshes: THREE.Mesh[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })

  let triangleCount = 0
  meshes.forEach((mesh) => {
    const material = createStandardMaterial()
    mesh.material = material
    mesh.userData.primaryMaterial = material
    if (!mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals()
    }
    const index = mesh.geometry.getIndex()
    triangleCount += index ? index.count / 3 : mesh.geometry.attributes.position.count / 3
  })

  identifyParts(meshes)

  const tree: ComponentNode =
    meshes.length === 1
      ? { id: 'n0', name: file.name, mesh: meshes[0], children: [] }
      : {
          id: 'n0',
          name: file.name,
          mesh: null,
          children: meshes.map((mesh, i) => ({
            id: `n${i + 1}`,
            name: mesh.name,
            mesh,
            children: [],
          })),
        }

  return { object: group, triangleCount, tree }
}
