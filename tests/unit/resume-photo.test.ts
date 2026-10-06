import { describe, expect, it } from 'vitest'
import {
  centerSquare,
  PHOTO_MAX_BYTES,
  photoFilename,
  sniffImage,
  validatePhotoBytes,
  validatePhotoFile,
} from '@/lib/resume/photo'
import { jpegHeader, pngHeader, webpHeader } from '@/tests/fixtures/images'

describe('validatePhotoFile (what the user picks)', () => {
  it('accepts JPEG, PNG and WebP up to 2 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validatePhotoFile({ type, size: 300_000 })).toBeNull()
    }
    expect(validatePhotoFile({ type: 'image/png', size: PHOTO_MAX_BYTES })).toBeNull()
  })

  it('refuses other types, empty and oversized files', () => {
    expect(validatePhotoFile({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/)
    expect(validatePhotoFile({ type: 'image/svg+xml', size: 10 })).toMatch(/JPEG, PNG or WebP/)
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toMatch(/2 MB/)
    expect(validatePhotoFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/)
  })
})

describe('sniffImage', () => {
  it('reads type and size from the bytes, not the name', () => {
    expect(sniffImage(pngHeader(640, 480))).toEqual({ type: 'image/png', width: 640, height: 480 })
    expect(sniffImage(jpegHeader(512, 512))).toEqual({ type: 'image/jpeg', width: 512, height: 512 })
    expect(sniffImage(webpHeader(300, 200))).toEqual({ type: 'image/webp', width: 300, height: 200 })
  })

  it('returns null for anything else', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a......'))).toBeNull()
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull()
  })
})

describe('validatePhotoBytes (what the server stores)', () => {
  it('accepts a square JPEG or PNG within bounds', () => {
    expect(validatePhotoBytes(jpegHeader(512, 512))).toEqual({ ok: true, type: 'image/jpeg', width: 512, height: 512 })
    expect(validatePhotoBytes(pngHeader(256, 256))).toMatchObject({ ok: true, type: 'image/png' })
  })

  it('refuses what pdflatex or the layout cannot use', () => {
    expect(validatePhotoBytes(webpHeader(512, 512))).toMatchObject({ ok: false, error: expect.stringMatching(/JPEG or PNG/) })
    expect(validatePhotoBytes(jpegHeader(640, 480))).toMatchObject({ ok: false, error: expect.stringMatching(/square/) })
    expect(validatePhotoBytes(jpegHeader(2048, 2048))).toMatchObject({ ok: false, error: expect.stringMatching(/1024 px/) })
    expect(validatePhotoBytes(jpegHeader(32, 32))).toMatchObject({ ok: false, error: expect.stringMatching(/64 px/) })
    expect(validatePhotoBytes(Buffer.from('not an image'))).toMatchObject({ ok: false })
    expect(validatePhotoBytes(Buffer.alloc(0))).toMatchObject({ ok: false, error: expect.stringMatching(/empty/) })
    expect(validatePhotoBytes(jpegHeader(512, 512, PHOTO_MAX_BYTES + 1))).toMatchObject({ ok: false, error: expect.stringMatching(/2 MB/) })
  })
})

describe('crop and naming', () => {
  it('takes the centre square', () => {
    expect(centerSquare(800, 600)).toEqual({ sx: 100, sy: 0, side: 600 })
    expect(centerSquare(600, 801)).toEqual({ sx: 0, sy: 100, side: 600 })
    expect(centerSquare(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 })
  })

  it('stores under lee’s own file names', () => {
    expect(photoFilename('image/jpeg')).toBe('lee-photo.jpg')
    expect(photoFilename('image/png')).toBe('lee-photo.png')
  })
})
