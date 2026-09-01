import * as THREE from 'three'

// Shared, mutable array reference. Every model material points its own
// `.clippingPlanes` at this SAME array instance (set once, at creation), so
// toggling the clipping plane only ever needs to mutate this array's
// contents in place - every material picks up the change automatically.
// Anything that should stay exempt from the clipping plane (measurement
// overlays, gizmo, grid...) simply never assigns this array to its own
// material and keeps three.js's default (empty, i.e. unclipped).
export const activeClippingPlanes: THREE.Plane[] = []
