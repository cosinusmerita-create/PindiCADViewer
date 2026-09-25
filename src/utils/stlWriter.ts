// STL binaire : 80 octets d'en-tête, 4 octets de nombre de triangles, puis
// 50 octets par triangle (normale + 3 sommets en float32 + 2 octets d'attribut).
// ~5x plus compact que l'ASCII, et lu par tous les trancheurs.
export function writeBinaryStl(positions: ArrayLike<number>, name: string): Uint8Array {
  const count = Math.floor(positions.length / 9)
  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  const header = `PindiCADViewer - ${name}`.slice(0, 79)
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f)
  view.setUint32(80, count, true)
  let offset = 84
  for (let t = 0; t < count; t++) {
    const o = t * 9
    const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2]
    const vx = positions[o + 6] - positions[o], vy = positions[o + 7] - positions[o + 1], vz = positions[o + 8] - positions[o + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    view.setFloat32(offset, nx, true)
    view.setFloat32(offset + 4, ny, true)
    view.setFloat32(offset + 8, nz, true)
    for (let i = 0; i < 9; i++) view.setFloat32(offset + 12 + i * 4, positions[o + i], true)
    offset += 50
  }
  return new Uint8Array(buffer)
}
