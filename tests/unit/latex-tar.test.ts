import { describe, it, expect } from 'vitest'
import { createTar } from '@/lib/latex/tar'

const BLOCK = 512

function readHeader(tar: Uint8Array, offset: number) {
  const text = (start: number, len: number) =>
    new TextDecoder().decode(tar.subarray(offset + start, offset + start + len)).replace(/\0.*$/s, '')
  return {
    name: text(0, 100),
    size: parseInt(text(124, 12).trim(), 8),
    checksum: parseInt(text(148, 8).trim(), 8),
    typeflag: text(156, 1),
    magic: text(257, 6),
  }
}

function checksumOf(tar: Uint8Array, offset: number): number {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) {
    // The checksum field itself counts as eight spaces.
    sum += i >= 148 && i < 156 ? 0x20 : tar[offset + i]!
  }
  return sum
}

describe('createTar (ustar, for latexonline.cc)', () => {
  it('writes one header + padded data block per file and two zero end blocks', () => {
    const tex = new TextEncoder().encode('\\documentclass{article}')
    const tar = createTar([{ name: 'main.tex', bytes: tex }])
    // header + 1 data block + 2 end blocks
    expect(tar.length).toBe(BLOCK * 4)
    const h = readHeader(tar, 0)
    expect(h).toMatchObject({ name: 'main.tex', size: tex.length, typeflag: '0', magic: 'ustar' })
    expect(h.checksum).toBe(checksumOf(tar, 0))
    expect(new TextDecoder().decode(tar.subarray(BLOCK, BLOCK + tex.length))).toBe('\\documentclass{article}')
    expect(tar.subarray(BLOCK * 2).every((b) => b === 0)).toBe(true)
  })

  it('places each following file at the next 512-byte boundary', () => {
    const big = new Uint8Array(BLOCK + 10).fill(7)
    const tar = createTar([
      { name: 'main.tex', bytes: big },
      { name: 'photo.png', bytes: new Uint8Array([1, 2, 3]) },
    ])
    // main: header + 2 data blocks; photo: header + 1 data block; + 2 end
    expect(tar.length).toBe(BLOCK * 7)
    const second = readHeader(tar, BLOCK * 3)
    expect(second).toMatchObject({ name: 'photo.png', size: 3 })
    expect(Array.from(tar.subarray(BLOCK * 4, BLOCK * 4 + 3))).toEqual([1, 2, 3])
  })

  it('rejects unsafe or oversized names', () => {
    const bytes = new Uint8Array([1])
    expect(() => createTar([{ name: '../etc/passwd', bytes }])).toThrow(/file name/i)
    expect(() => createTar([{ name: 'a/b.png', bytes }])).toThrow(/file name/i)
    expect(() => createTar([{ name: '', bytes }])).toThrow(/file name/i)
    expect(() => createTar([{ name: 'x'.repeat(101), bytes }])).toThrow(/file name/i)
  })

  it('rejects duplicate names', () => {
    const bytes = new Uint8Array([1])
    expect(() => createTar([{ name: 'main.tex', bytes }, { name: 'main.tex', bytes }])).toThrow(/duplicate/i)
  })
})
