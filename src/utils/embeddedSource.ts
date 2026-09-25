import type { EmbeddedSource } from '../types/model'

// A .pindi project normally only stores settings (camera, colors, measures...)
// and needs the original CAD file to apply them onto. To make a project
// self-contained, the source file itself is embedded in the .pindi: gzip'd
// when the browser supports CompressionStream (STEP is plain text and shrinks
// several times over), then base64'd to live inside the JSON.

// Above this the .pindi would be unwieldy; such projects keep asking for the
// source file, like before.
export const MAX_EMBEDDED_SOURCE_BYTES = 150 * 1024 * 1024

function bytesToBase64(bytes: Uint8Array): string {
  // btoa chokes on huge strings built in one go - go through fixed-size chunks.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function pipeThrough(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

export async function encodeSource(file: File): Promise<EmbeddedSource> {
  const raw = new Uint8Array(await file.arrayBuffer())
  if (typeof CompressionStream === 'function') {
    try {
      const packed = await pipeThrough(raw, new CompressionStream('gzip'))
      return { name: file.name, size: raw.length, encoding: 'gzip-base64', data: bytesToBase64(packed) }
    } catch {
      // fall through to the uncompressed encoding
    }
  }
  return { name: file.name, size: raw.length, encoding: 'base64', data: bytesToBase64(raw) }
}

export async function decodeSource(source: EmbeddedSource): Promise<File> {
  let bytes = base64ToBytes(source.data)
  if (source.encoding === 'gzip-base64') {
    bytes = new Uint8Array(await pipeThrough(bytes, new DecompressionStream('gzip')))
  }
  return new File([bytes], source.name)
}
