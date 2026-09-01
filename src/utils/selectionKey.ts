// A stable dictionary key for "the current set of animated node ids",
// shared by the `animations` record and the animation-pivot registry (see
// animationPivot.ts). A single id encodes to itself (so nothing changes for
// the common single-part case, and existing behavior is unaffected); more
// than one id sorts and joins on a comma, which no loader ever generates in
// a real node id (see stepLoader.ts/stlLoader.ts/objLoader.ts - always plain
// "nX"/"nX-mY" strings), so decoding is unambiguous either way.
const KEY_SEPARATOR = ','

export function encodeSelectionKey(ids: string[]): string {
  if (ids.length <= 1) return ids[0] ?? ''
  return [...ids].sort().join(KEY_SEPARATOR)
}

export function decodeSelectionKey(key: string): string[] {
  return key.length === 0 ? [] : key.split(KEY_SEPARATOR)
}
