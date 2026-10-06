import { centerSquare, PHOTO_SIZE } from './photo'

/**
 * Browser only: centre square-crop and downscale a picked image to
 * PHOTO_SIZE px, re-encoded as JPEG (what pdflatex reads; WebP input
 * included). Runs on a canvas, so the server needs no image library.
 */

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function cropToSquareJpeg(file: Blob, size = PHOTO_SIZE): Promise<Blob> {
  const image = await decode(file)
  try {
    const { sx, sy, side } = centerSquare(image.width, image.height)
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    // JPEG has no alpha: paint transparent PNG/WebP areas white, not black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out, out)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image.source, sx, sy, side, side, 0, 0, out, out)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.9),
    )
  } finally {
    image.close()
  }
}
