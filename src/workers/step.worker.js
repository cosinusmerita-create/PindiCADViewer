/* eslint-disable no-undef */
// A leading "/" would resolve from the site's true root, and a plain
// import.meta.env.BASE_URL prefix breaks the other way once that base is
// relative ("./", used for the Electron file:// build - see
// vite.config.ts): importScripts resolves a relative path against the
// WORKER SCRIPT's own URL (dist/assets/step.worker-*.js), not the page's,
// so "./occt-import-js/..." would look one directory too deep. self.location
// (not import.meta.url) is the anchor: this worker is loaded with
// { type: 'classic' } (importScripts itself is unavailable to module
// workers), and referencing import.meta - valid only inside an ES module -
// from a classic script is a SyntaxError, which broke loading every STEP
// file. self.location.href gives the same "this worker's own final URL"
// under any base, absolute or relative alike, without requiring module
// syntax.
importScripts(new URL('../occt-import-js/occt-import-js.js', self.location.href).href)

let occtPromise = null

function getOcct() {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (path) => new URL('../occt-import-js/' + path, self.location.href).href,
    })
  }
  return occtPromise
}

self.onmessage = async (event) => {
  const { fileBuffer } = event.data
  try {
    const occt = await getOcct()
    const fileData = new Uint8Array(fileBuffer)
    // occt-import-js doesn't expose true B-Rep edges/curves (verified against
    // its actual output - only the triangulated mesh plus a triangle-range ->
    // originating-face table, brep_faces, is available), so exact analytic
    // measurement isn't possible from this library. What tightening the
    // deflection *does* buy: a tessellation fine enough that measurements
    // taken from it agree with the true STEP geometry to within the 2-decimal
    // (hundredth of a mm) precision this app now targets. An absolute value
    // is used rather than the bounding-box-ratio default so a small part in
    // a large assembly doesn't get coarsened along with everything else.
    const result = occt.ReadStepFile(fileData, {
      linearDeflectionType: 'absolute_value',
      linearDeflection: 0.01,
      angularDeflection: 0.2,
    })

    if (!result.success || !result.meshes || result.meshes.length === 0) {
      self.postMessage({ success: false, error: "Le fichier STEP n'a pas pu être lu ou ne contient aucune géométrie." })
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
