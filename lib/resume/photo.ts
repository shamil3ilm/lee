/**
 * Profile photo rules — client-safe (the upload card and the server route
 * share them).
 *
 * The user picks a JPEG, PNG or WebP of up to 2 MB. The browser square-crops
 * it (centre) and downscales it to PHOTO_SIZE px on a canvas, then uploads a
 * JPEG: lee has no image library on the server (sharp is not a dependency),
 * and pdflatex reads JPEG and PNG but not WebP. The server re-checks what
 * arrives from the bytes themselves — type sniffed from the magic number,
 * size, square, at most PHOTO_MAX_SIDE px — so a direct API call can't store
 * something the LaTeX pipeline can't use.
 */

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
/** What the user may pick. */
export const PHOTO_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** What the server stores (pdflatex reads these). */
export const PHOTO_STORED_TYPES = ['image/jpeg', 'image/png'] as const
/** Output side of the client-side crop. */
export const PHOTO_SIZE = 512
export const PHOTO_MAX_SIDE = 1024
export const PHOTO_MIN_SIDE = 64

export type PhotoInputType = (typeof PHOTO_INPUT_TYPES)[number]
export type PhotoStoredType = (typeof PHOTO_STORED_TYPES)[number]

const MB = (n: number): string => `${(n / (1024 * 1024)).toFixed(0)} MB`

/** Check a picked file before cropping. Null when fine, else a user-facing message. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(PHOTO_INPUT_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP image.'
  if (file.size > PHOTO_MAX_BYTES) return `The photo is larger than ${MB(PHOTO_MAX_BYTES)}.`
  if (file.size === 0) return 'The file is empty.'
  return null
}

export interface ImageInfo {
  type: PhotoInputType
  width: number
  height: number
}

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!
}
function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
}
function u16le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8)
}
function u24le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]!
    if (marker === 0xff) {
      i += 1
      continue
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = u16be(b, i + 2)
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) }
    }
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webpInfo(b: Uint8Array): ImageInfo | null {
  const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
  if (chunk === 'VP8 ' && b.length >= 30) {
    return { type: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && b.length >= 30) {
    return { type: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  }
  return null
}

/** Type and dimensions from the bytes (magic number + header), or null when it is none of ours. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const b = bytes
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    const ihdr = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
    return ihdr === 'IHDR' ? { type: 'image/png', width: u32be(b, 16), height: u32be(b, 20) } : null
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegInfo(b)
  if (b.length >= 16 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    return webpInfo(b)
  }
  return null
}

export type PhotoCheck = { ok: true; type: PhotoStoredType; width: number; height: number } | { ok: false; error: string }

/** Server-side check of the (already cropped) upload. */
export function validatePhotoBytes(bytes: Uint8Array): PhotoCheck {
  if (bytes.length === 0) return { ok: false, error: 'The file is empty.' }
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, error: `The photo is larger than ${MB(PHOTO_MAX_BYTES)}.` }
  const info = sniffImage(bytes)
  if (!info) return { ok: false, error: 'Use a JPEG, PNG or WebP image.' }
  if (info.type === 'image/webp') return { ok: false, error: 'Crop the photo in lee first: PDFs need a JPEG or PNG.' }
  if (info.width !== info.height) return { ok: false, error: 'The photo must be square (lee crops it for you).' }
  if (info.width < PHOTO_MIN_SIDE) return { ok: false, error: `The photo is smaller than ${PHOTO_MIN_SIDE} px.` }
  if (info.width > PHOTO_MAX_SIDE) return { ok: false, error: `The photo is larger than ${PHOTO_MAX_SIDE} px.` }
  return { ok: true, type: info.type, width: info.width, height: info.height }
}

/** The stored file name — what `\includegraphics` references in the variant PDF. */
export function photoFilename(type: PhotoStoredType): string {
  return type === 'image/png' ? 'lee-photo.png' : 'lee-photo.jpg'
}

/** Centre square of a `w`×`h` image: the source rectangle the canvas draws. */
export function centerSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h)
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side }
}
