import * as THREE from 'three'

export type FlowTrajectoryShape = 'linear' | 'circular'
export type FlowAxis = 'x' | 'y' | 'z'

export interface CircleTrajectoryParams {
  axisVec: THREE.Vector3
  u: THREE.Vector3
  v: THREE.Vector3
  centerU: number
  centerV: number
  radius: number
  minHeight: number
  maxHeight: number
  startAngle: number
}

// Fits a circle (in the plane perpendicular to `axis`) through the user's
// picked points, for the "circulaire" trajectory mode - a cylindrical
// chamber's swirl/vortex, rather than the straight/curved path between
// points that "linéaire" already covers. `u`/`v` are an orthonormal basis
// for that plane, so a point's in-plane position is `pu*u + pv*v`; height
// is just its own coordinate along `axis`. The sweep starts at the angle
// of the FIRST picked point, so the animation begins where the user
// actually clicked rather than at an arbitrary reference direction.
export function computeCircleTrajectory(path: THREE.Vector3[], axis: FlowAxis): CircleTrajectoryParams {
  const axisVec = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
  const helper = Math.abs(axisVec.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, axisVec).normalize()
  const v = new THREE.Vector3().crossVectors(axisVec, u).normalize()

  let sumU = 0
  let sumV = 0
  let minHeight = Infinity
  let maxHeight = -Infinity
  const projected = path.map((p) => {
    const height = p.dot(axisVec)
    minHeight = Math.min(minHeight, height)
    maxHeight = Math.max(maxHeight, height)
    const pu = p.dot(u)
    const pv = p.dot(v)
    sumU += pu
    sumV += pv
    return { pu, pv }
  })

  const centerU = sumU / path.length
  const centerV = sumV / path.length
  const radius = Math.max(
    projected.reduce((sum, p) => sum + Math.hypot(p.pu - centerU, p.pv - centerV), 0) / path.length,
    1e-6,
  )
  const startAngle = Math.atan2(projected[0].pv - centerV, projected[0].pu - centerU)

  return { axisVec, u, v, centerU, centerV, radius, minHeight, maxHeight, startAngle }
}

export function circleTrajectoryPointAt(params: CircleTrajectoryParams, turns: number, t: number): THREE.Vector3 {
  const angle = params.startAngle + t * Math.PI * 2 * turns
  const height = THREE.MathUtils.lerp(params.minHeight, params.maxHeight, t)
  return new THREE.Vector3()
    .addScaledVector(params.u, params.centerU + params.radius * Math.cos(angle))
    .addScaledVector(params.v, params.centerV + params.radius * Math.sin(angle))
    .addScaledVector(params.axisVec, height)
}

// No closed-form tangent is worth deriving here (the numerical one is
// exactly as accurate for animation purposes and stays correct even if the
// position formula above ever changes) - a tiny forward/backward
// difference, clamped to [0,1] so it stays well-defined at the endpoints.
export function circleTrajectoryTangentAt(params: CircleTrajectoryParams, turns: number, t: number): THREE.Vector3 {
  const eps = 0.001
  const t0 = Math.max(0, t - eps)
  const t1 = Math.min(1, t + eps)
  return circleTrajectoryPointAt(params, turns, t1).sub(circleTrajectoryPointAt(params, turns, t0)).normalize()
}
