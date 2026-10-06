/**
 * Synthetic image headers for photo validation tests: just enough bytes for
 * a sniffer to read type and size (no real pixels, no real people).
 */

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}
function u16be(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff]
}
function u24le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
}
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

export function pngHeader(width: number, height: number, padTo = 0): Buffer {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, 0, 0, 0, 0]
  return Buffer.from([...head, ...new Array(Math.max(0, padTo - head.length)).fill(0)])
}

export function jpegHeader(width: number, height: number, padTo = 0): Buffer {
  const app0 = [0xff, 0xe0, ...u16be(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const sof0 = [0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  const head = [0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]
  return Buffer.from([...head, ...new Array(Math.max(0, padTo - head.length)).fill(0)])
}

export function webpHeader(width: number, height: number): Buffer {
  const vp8x = [...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]
  return Buffer.from([...ascii('RIFF'), ...[vp8x.length + 4, 0, 0, 0], ...ascii('WEBP'), ...vp8x])
}
