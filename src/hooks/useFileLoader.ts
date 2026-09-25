import { useCallback } from 'react'
import * as THREE from 'three'
import { useModelStore } from './useModelState'
import { useToastStore } from './useToastStore'
import { loadCachedStep, loadStepFile } from '../utils/stepLoader'
import { decodeSource } from '../utils/embeddedSource'
import { loadStlFile } from '../utils/stlLoader'
import { loadObjFile } from '../utils/objLoader'
import { load3dxmlFile } from '../utils/threeDxmlLoader'
import { loadDxfFile } from '../utils/dxfLoader'
import {
  GEOMETRY_FORMATS,
  OPEN_FILE_ACCEPT,
  SOLIDWORKS_ERRORS,
  bridgeFormatForName,
  canUseSolidWorksBridge,
  formatForExtension,
} from '../utils/formats'
import { LazyEdgeDataMap, prewarmEdgeData, tagMeshesWithNodeIds } from '../utils/componentTree'
import { computeFileHash, parseProjectFile } from '../utils/projectFile'
import type { LoadResult } from '../types/model'

// The accepted formats live in utils/formats.ts (one list for the loader,
// the pickers, the drop zone and the Aide); re-exported for existing imports.
export { OPEN_FILE_ACCEPT, GEOMETRY_FILE_ACCEPT } from '../utils/formats'

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

// Background edge analysis of the previously loaded model, stopped when a
// new one replaces it.
let cancelPrewarm: (() => void) | null = null

export function useFileLoader() {
  const setModel = useModelStore((s) => s.setModel)
  const setLoading = useModelStore((s) => s.setLoading)
  const setError = useModelStore((s) => s.setError)
  const setSourceFileHash = useModelStore((s) => s.setSourceFileHash)
  const applyProjectFile = useModelStore((s) => s.applyProjectFile)
  const pushToast = useToastStore((s) => s.pushToast)

  const setSourceFile = useModelStore((s) => s.setSourceFile)

  // Puts a freshly built model on screen and records where it came from.
  const presentResult = useCallback(
    (result: LoadResult, fileName: string, hash: string, sourceFile: File | null) => {
      tagMeshesWithNodeIds(result.tree)
      const boundingBox = new THREE.Box3().setFromObject(result.object)
      const edgeData = new LazyEdgeDataMap(result.tree)
      setModel(result.object, fileName, Math.round(result.triangleCount), boundingBox, result.tree, edgeData)
      setSourceFileHash(hash)
      setSourceFile(sourceFile)
      if (result.fromCache) pushToast('Ouverture rapide : modèle chargé depuis le cache')
      cancelPrewarm?.()
      cancelPrewarm = prewarmEdgeData(edgeData)
    },
    [setModel, setSourceFileHash, setSourceFile, pushToast],
  )

  // Proprietary formats (SOLIDWORKS, Inventor, CATIA V5, Parasolid, DWG…):
  // the desktop app has the local SOLIDWORKS export a STEP/DXF copy, which
  // then goes through the normal pipeline below. Returns the converted file,
  // or null after reporting why it could not be converted.
  const convertThroughSolidWorks = useCallback(
    async (file: File, sourcePath?: string): Promise<File | null> => {
      const bridge = bridgeFormatForName(file.name)!
      if (!canUseSolidWorksBridge()) {
        setError(
          `${bridge.label} : format propriétaire sans lecteur libre. Ouvrez-le dans la version bureau de ` +
            'PindiCADViewer : elle le fait convertir par le SOLIDWORKS installé sur le poste.',
        )
        return null
      }
      const path = sourcePath || window.electronAPI?.getPathForFile?.(file) || ''
      if (!path) {
        setError(`Chemin du fichier « ${file.name} » inconnu : ouvrez-le avec Fichier → Ouvrir.`)
        return null
      }
      pushToast(`Ouverture de ${file.name} par SOLIDWORKS…`)
      const result = await window.electronAPI!.convertWithSolidWorks!(path)
      if (!result.ok || !result.bytes || !result.kind) {
        const text = SOLIDWORKS_ERRORS[result.code ?? ''] ?? `Conversion impossible (${result.code ?? 'erreur inconnue'}).`
        setError(result.message ? `${text} Détail : ${result.message}` : text)
        return null
      }
      pushToast(`${file.name} converti par SOLIDWORKS (${result.kind.toUpperCase()})`)
      // Named after the original so the tree and the title say what was opened.
      return new File([result.bytes], `${file.name}.${result.kind}`)
    },
    [setError, pushToast],
  )

  const loadGeometryFile = useCallback(
    async (original: File, sourcePath?: string): Promise<string | null> => {
      let file = original
      if (!formatForExtension(extensionOf(file)) && bridgeFormatForName(file.name)) {
        setLoading(true)
        setError(null)
        try {
          const converted = await convertThroughSolidWorks(file, sourcePath)
          if (!converted) return null
          file = converted
        } finally {
          setLoading(false)
        }
      }

      const ext = extensionOf(file)
      const format = formatForExtension(ext)
      if (!format) {
        const known = GEOMETRY_FORMATS.map((f) => f.label).join(', ')
        setError(`Format ".${ext}" non supporté. Formats lisibles : ${known}.`)
        return null
      }

      setLoading(true)
      setError(null)

      try {
        const hash = await computeFileHash(await file.arrayBuffer())

        let result
        switch (format.loader) {
          case 'step':
          case 'iges':
          case 'brep':
            result = await loadStepFile(file, hash, format.loader)
            break
          case 'stl':
            result = await loadStlFile(file)
            break
          case 'obj':
            result = await loadObjFile(file)
            break
          case '3dxml':
            result = await load3dxmlFile(file)
            break
          case 'dxf':
            result = await loadDxfFile(file)
            break
        }

        presentResult(result, file.name, hash, file)
        return hash
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement du fichier.')
        return null
      } finally {
        setLoading(false)
      }
    },
    [setLoading, setError, presentResult, convertThroughSolidWorks],
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
          // 1. The source file carried inside the .pindi - the project is then
          //    fully self-contained.
          let loadedHash: string | null = null
          if (project.embeddedSource) {
            try {
              loadedHash = await loadGeometryFile(await decodeSource(project.embeddedSource))
            } catch {
              pushToast('Le fichier source intégré au projet est illisible.')
            }
          }

          // 2. A project saved without its source: if that exact file was
          //    opened on this computer before, its parsed model is still in
          //    the cache and identifies by content hash alone.
          if (!loadedHash && project.sourceFileHash) {
            const cached = await loadCachedStep(project.sourceFileHash, project.sourceFile || 'modele.step')
            if (cached) {
              presentResult(cached, project.sourceFile || 'modele.step', project.sourceFileHash, null)
              loadedHash = project.sourceFileHash
            }
          }

          // 3. Last resort, as before: ask for the source file.
          if (!loadedHash) {
            setLoading(false)
            const picked = await promptForSourceFile(project.sourceFile)
            if (!picked) return
            loadedHash = await loadGeometryFile(picked)
            if (!loadedHash) return
            if (loadedHash !== project.sourceFileHash) {
              pushToast('Attention : le fichier sélectionné ne correspond pas exactement au fichier source du projet.')
            }
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
    [setLoading, setError, loadGeometryFile, presentResult, applyProjectFile, pushToast],
  )

  // `sourcePath` (Electron, file opened by path): lets a proprietary format be
  // handed to SOLIDWORKS without first reading its bytes into the renderer.
  const loadFile = useCallback(
    async (file: File, sourcePath?: string) => {
      if (isPindiFile(file)) {
        await loadProjectFile(file)
        return
      }
      await loadGeometryFile(file, sourcePath)
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
