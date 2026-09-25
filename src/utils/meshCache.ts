// Persistent cache of parsed STEP models, in IndexedDB (available in both the
// browser and the Electron renderer, no extra IPC needed).
//
// Reading a STEP file with occt-import-js is slow (tens of seconds for a
// 60-part assembly) but deterministic: same file bytes + same meshing quality
// = same triangles. So the result of the first open is stored, keyed by the
// file's content hash and the quality, and every later open of the same file
// skips the parse entirely.

const DB_NAME = 'pindicad-mesh-cache'
const STORE = 'models'
// Bump when the shape of the cached payload (or how it is rebuilt) changes,
// so entries written by an older build are ignored instead of misread.
export const MESH_CACHE_VERSION = 1

const MAX_ENTRIES = 6
const MAX_TOTAL_BYTES = 400 * 1024 * 1024

export interface CachedModel<T> {
  key: string
  version: number
  fileName: string
  bytes: number
  lastUsed: number
  data: T
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<R>(request: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Everything below is best-effort: a private window, blocked storage or a full
// disk must never stop a model from opening, so failures just mean "no cache".

export async function readMeshCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const entry = (await requestToPromise(store.get(key))) as CachedModel<T> | undefined
    if (!entry || entry.version !== MESH_CACHE_VERSION) {
      db.close()
      return null
    }
    entry.lastUsed = Date.now()
    store.put(entry)
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
    db.close()
    return entry.data
  } catch {
    return null
  }
}

export async function writeMeshCache<T>(key: string, fileName: string, bytes: number, data: T): Promise<void> {
  try {
    const db = await openDb()
    const entry: CachedModel<T> = { key, version: MESH_CACHE_VERSION, fileName, bytes, lastUsed: Date.now(), data }
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(entry)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    await pruneMeshCache(db)
    db.close()
  } catch {
    // no cache this time (quota, blocked storage...) - the model itself is fine
  }
}

// Keeps the cache bounded: least recently used entries go first, until both
// the entry count and the total size are within limits.
async function pruneMeshCache(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const all = (await requestToPromise(store.getAll())) as CachedModel<unknown>[]
  all.sort((a, b) => b.lastUsed - a.lastUsed)
  let total = 0
  all.forEach((entry, index) => {
    total += entry.bytes
    if (index >= MAX_ENTRIES || total > MAX_TOTAL_BYTES) store.delete(entry.key)
  })
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function clearMeshCache(): Promise<number> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const count = await requestToPromise(store.count())
    store.clear()
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
    db.close()
    return count
  } catch {
    return 0
  }
}
