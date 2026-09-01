import { useCallback } from 'react'
import * as THREE from 'three'
import { useModelStore } from './useModelState'
import { useToastStore } from './useToastStore'
import { loadStepFile } from '../utils/stepLoader'
import { loadStlFile } from '../utils/stlLoader'
import { loadObjFile } from '../utils/objLoader'
import { buildEdgeDataMap, tagMeshesWithNodeIds } from '../utils/componentTree'
import { computeFileHash, parseProjectFile } from '../utils/projectFile'

const GEOMETRY_EXTENSIONS = ['step', 'stp', 'stl', 'obj']
export const OPEN_FILE_ACCEPT = '.step,.stp,.stl,.obj,.pindi'
export const GEOMETRY_FILE_ACCEPT = '.step,.stp,.stl,.obj'

// Blob/File content is an immutable snapshot, not a stream - calling
// .arrayBuffer() more than once on the same File is well-defined and just
// returns independent copies of the same bytes, so hashing the file here
// doesn't interfere with the loader functions below separately reading it
// themselves.
function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

// Some mobile download managers rename a downloaded .pindi file by
// appending the extension matching its actual MIME type (".pindi.json"),
// even though the save side now avoids that MIME (see fileActions.ts) -
// this still recognizes an older or otherwise-mis-renamed file by name
// instead of only trusting the last extension.
function isPindiFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.pindi') || name.endsWith('.pindi.json')
}

// Shows the "this project needs its source STEP file" modal (see
// PindiSourcePrompt.tsx, which owns the actual file input and resolves this
// promise once the user picks a file or cancels) instead of jumping
// straight to the native file picker, so the user understands *why* they're
// being asked before the OS dialog interrupts them.
function promptForSourceFile(sourceFile: string): Promise<File | null> {
  return new Promise((resolve) => {
    useModelStore.getState().setPindiSourcePrompt({ sourceFile, resolve })
  })
}

export function useFileLoader() {
  const setModel = useModelStore((s) => s.setModel)
  const setLoading = useModelStore((s) => s.setLoading)
  const setError = useModelStore((s) => s.setError)
  const setSourceFileHash = useModelStore((s) => s.setSourceFileHash)
  const applyProjectFile = useModelStore((s) => s.applyProjectFile)
  const pushToast = useToastStore((s) => s.pushToast)

  const loadGeometryFile = useCallback(
    async (file: File): Promise<string | null> => {
      const ext = extensionOf(file)
      if (!GEOMETRY_EXTENSIONS.includes(ext)) {
        setError(`Format ".${ext}" non supporté. Utilisez .step, .stp, .stl ou .obj.`)
        return null
      }

      setLoading(true)
      setError(null)

      try {
        const hash = await computeFileHash(await file.arrayBuffer())

        let result
        if (ext === 'step' || ext === 'stp') result = await loadStepFile(file)
        else if (ext === 'stl') result = await loadStlFile(file)
        else result = await loadObjFile(file)

        tagMeshesWithNodeIds(result.tree)
        const boundingBox = new THREE.Box3().setFromObject(result.object)
        const edgeData = buildEdgeDataMap(result.tree)
        setModel(result.object, file.name, Math.round(result.triangleCount), boundingBox, result.tree, edgeData)
        setSourceFileHash(hash)
        return hash
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement du fichier.')
        return null
      } finally {
        setLoading(false)
      }
    },
    [setModel, setLoading, setError, setSourceFileHash],
  )

  // A .pindi project only stores settings, not geometry - it needs the
  // matching source CAD file to apply them onto. If the model already
  // loaded is that same file (by content hash, not just name), settings
  // apply immediately; otherwise the user is asked to pick it.
  const loadProjectFile = useCallback(
    async (file: File) => {
      setLoading(true)
      setError(null)

      let project
      try {
        project = parseProjectFile(await file.text())
      } catch {
        setLoading(false)
        setError('Fichier .pindi corrompu.')
        pushToast('Fichier .pindi corrompu')
        return
      }

      try {
        const currentHash = useModelStore.getState().sourceFileHash

        if (currentHash !== project.sourceFileHash) {
          setLoading(false)
          const picked = await promptForSourceFile(project.sourceFile)
          if (!picked) return
          const loadedHash = await loadGeometryFile(picked)
          if (!loadedHash) return
          if (loadedHash !== project.sourceFileHash) {
            pushToast('Attention : le fichier sélectionné ne correspond pas exactement au fichier source du projet.')
          }
        }

        applyProjectFile(project)
        pushToast(`Projet restauré — ${project.sourceFile}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement du projet .pindi.')
      } finally {
        setLoading(false)
      }
    },
    [setLoading, setError, loadGeometryFile, applyProjectFile, pushToast],
  )

  const loadFile = useCallback(
    async (file: File) => {
      if (isPindiFile(file)) {
        await loadProjectFile(file)
        return
      }
      await loadGeometryFile(file)
    },
    [loadProjectFile, loadGeometryFile],
  )

  // For the Ctrl+O shortcut (App.tsx) - opens the same native picker as the
  // toolbar's "Ouvrir" button, accepting STEP/STL/OBJ or .pindi alike.
  const openFilePicker = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = OPEN_FILE_ACCEPT
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) loadFile(file)
    }
    input.click()
  }, [loadFile])

  return { loadFile, openFilePicker }
}
