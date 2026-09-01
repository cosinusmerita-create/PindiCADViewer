// Resizes a captured PNG data URL onto a fixed-size canvas using a "contain"
// fit (scaled uniformly, centered, letterboxed) rather than a naive stretch
// - the live 3D viewport can be any aspect ratio, and squashing it to fit an
// arbitrary fixed output size would visibly distort the part's proportions,
// which is exactly wrong for a technical document.
export function resizeImageDataUrl(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number,
  backgroundColor = '#1a1a2e',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('2D canvas context unavailable'))
        return
      }
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, targetWidth, targetHeight)

      const scale = Math.min(targetWidth / image.width, targetHeight / image.height)
      const drawWidth = image.width * scale
      const drawHeight = image.height * scale
      const dx = (targetWidth - drawWidth) / 2
      const dy = (targetHeight - drawHeight) / 2
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight)

      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error("Impossible de charger l'image capturée."))
    image.src = dataUrl
  })
}

// Fetches a public static asset (the app logo) and returns it as a data URL
// - the practical way to get a base64 image for jsPDF's addImage() without
// duplicating the binary asset a second time as a giant string literal in
// source code.
export async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
