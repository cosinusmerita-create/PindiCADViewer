/* eslint-disable no-undef */
// The occt-import-js folder's URL is computed by the MAIN thread (see
// stepLoader.ts) from the page's base and sent with each message, instead of
// being derived here from self.location: in dev this worker is served from
// /PindiCADViewer/src/workers/, in the build from dist/assets/, so any
// path relative to the worker's own URL is right in one and wrong in the
// other. The page URL + BASE_URL resolves correctly under both the absolute
// GitHub Pages base and the relative "./" base of the Electron file:// build
// (see vite.config.ts). importScripts is called lazily, once, because the
// folder URL only arrives with the first message; this worker is a classic
// one (importScripts is unavailable to module workers).
let occtPromise = null

function getOcct(occtBaseUrl) {
  if (!occtPromise) {
    importScripts(occtBaseUrl + 'occt-import-js.js')
    occtPromise = occtimportjs({
      locateFile: (path) => occtBaseUrl + path,
    })
  }
  return occtPromise
}

// The same occt-import-js build reads three B-Rep exchange formats with an
// identical result shape (meshes + assembly root), so one worker serves them
// all; `format` only picks the reader and the wording of the failure message.
const READERS = {
  step: { read: (occt, data, params) => occt.ReadStepFile(data, params), label: 'STEP' },
  iges: { read: (occt, data, params) => occt.ReadIgesFile(data, params), label: 'IGES' },
  brep: { read: (occt, data, params) => occt.ReadBrepFile(data, params), label: 'BREP' },
}

self.onmessage = async (event) => {
  const { fileBuffer, occtBaseUrl, meshParams, format } = event.data
  const reader = READERS[format] || READERS.step
  try {
    const occt = await getOcct(occtBaseUrl)
    const fileData = new Uint8Array(fileBuffer)
    // occt-import-js doesn't expose true B-Rep edges/curves (verified against
    // its actual output - only the triangulated mesh plus a triangle-range ->
    // originating-face table, brep_faces, is available), so exact analytic
    // measurement isn't possible from this library: measurements are only as
    // exact as the tessellation. How fine that is - and therefore how long
    // the file takes to open - is the user's choice (see stepQuality.ts);
    // null keeps occt-import-js's own size-relative default.
    const result = reader.read(occt, fileData, meshParams ?? null)

    if (!result.success || !result.meshes || result.meshes.length === 0) {
      self.postMessage({
        success: false,
        error: `Le fichier ${reader.label} n'a pas pu être lu ou ne contient aucune géométrie.`,
      })
      return
    }

    const meshes = result.meshes.map((mesh) => {
      const position = Float32Array.from(mesh.attributes.position.array)
      const normal = mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : null
      const index = Uint32Array.from(mesh.index.array)
      // The exact partition of this mesh's triangles into their true
      // originating B-Rep faces, straight from OpenCascade - independent of
      // tessellation seams, unlike inferring face boundaries from a
      // smoothness-angle threshold on the mesh alone (see surfacePatches.ts).
      const brepFaces = (mesh.brep_faces || []).map((f) => ({ first: f.first, last: f.last }))
      return {
        name: mesh.name || '',
        color: mesh.color || null,
        position,
        normal,
        index,
        brepFaces,
      }
    })

    const transferList = []
    for (const m of meshes) {
      transferList.push(m.position.buffer)
      if (m.normal) transferList.push(m.normal.buffer)
      transferList.push(m.index.buffer)
    }

    self.postMessage({ success: true, meshes, root: result.root || null }, transferList)
  } catch (err) {
    self.postMessage({ success: false, error: err && err.message ? err.message : String(err) })
  }
}
