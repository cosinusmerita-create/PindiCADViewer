import * as THREE from 'three'
import { getPrimaryMaterial } from './componentTree'

// Red emissive glow on colliding parts. Applied to the mesh's persistent
// material AND whatever display-mode material is currently swapped in (see
// displayMode.ts), and the originals are remembered so clearing restores the
// exact previous look, including user-set emissive values.
const saved = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; intensity: number }>()

function emissiveMaterialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const candidates = [getPrimaryMaterial(mesh), ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]
  return candidates.filter((m): m is THREE.MeshStandardMaterial => !!m && 'emissive' in m)
}

export function clearCollisionHighlight() {
  for (const [material, original] of saved) {
    material.emissive.copy(original.color)
    material.emissiveIntensity = original.intensity
  }
  saved.clear()
}

export function setCollisionHighlight(meshes: THREE.Mesh[]) {
  clearCollisionHighlight()
  for (const mesh of meshes) {
    for (const material of emissiveMaterialsOf(mesh)) {
      if (!saved.has(material)) {
        saved.set(material, { color: material.emissive.clone(), intensity: material.emissiveIntensity })
      }
      material.emissive.set(0xff0000)
      material.emissiveIntensity = 0.9
    }
  }
}

let audioContext: AudioContext | null = null
let lastBeep = 0

// Short blip at the moment a move gets blocked. Throttled, and silently
// skipped where WebAudio is unavailable or not yet allowed to start.
export function playCollisionBeep() {
  const now = performance.now()
  if (now - lastBeep < 250) return
  lastBeep = now
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'square'
    osc.frequency.value = 220
    gain.gain.setValueAtTime(0.06, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12)
    osc.connect(gain).connect(audioContext.destination)
    osc.start()
    osc.stop(audioContext.currentTime + 0.12)
  } catch {
    // no audio available - the red highlight is the primary feedback anyway
  }
}
