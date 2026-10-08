/**
 * Minimal POSIX ustar writer. latexonline.cc's /data endpoint only accepts a
 * tarball upload (it answers "failed to extract tarball" for a loose .tex),
 * so main.tex and its assets are packed into one archive. Names are relative
 * paths ('logo.png', 'figures/logo.png'): both compile services extract
 * folders (verified 2026-10-08), so `\input{sections/intro}` resolves from
 * the working directory as in Overleaf. No directory entries are needed.
 */
import { isSafeProjectPath } from './project/paths'

export interface TarEntry {
  name: string
  bytes: Uint8Array
}

const BLOCK = 512

export class TarNameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TarNameError'
  }
}

function assertSafeName(name: string): void {
  // At most 100 bytes, so the path always fits ustar's name field.
  if (!isSafeProjectPath(name)) throw new TarNameError(`Unsupported file name for compile: "${name}"`)
}

/** A file whose path is also a folder of another file ('a' and 'a/b') can't be extracted. */
function assertNoFileFolderClash(names: ReadonlySet<string>): void {
  for (const name of names) {
    const parts = name.split('/')
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/')
      if (names.has(folder)) throw new TarNameError(`"${folder}" is both a file and a folder.`)
    }
  }
}

function writeString(block: Uint8Array, offset: number, length: number, value: string): void {
  block.set(new TextEncoder().encode(value).subarray(0, length), offset)
}

/** Octal, zero-padded, NUL-terminated field as ustar expects. */
function writeOctal(block: Uint8Array, offset: number, length: number, value: number): void {
  writeString(block, offset, length - 1, value.toString(8).padStart(length - 1, '0'))
}

function header(name: string, size: number, mtimeSeconds: number): Uint8Array {
  const block = new Uint8Array(BLOCK)
  writeString(block, 0, 100, name)
  writeOctal(block, 100, 8, 0o644) // mode
  writeOctal(block, 108, 8, 0) // uid
  writeOctal(block, 116, 8, 0) // gid
  writeOctal(block, 124, 12, size)
  writeOctal(block, 136, 12, mtimeSeconds)
  block.fill(0x20, 148, 156) // checksum placeholder: eight spaces
  writeString(block, 156, 1, '0') // regular file
  writeString(block, 257, 6, 'ustar') // magic + NUL
  writeString(block, 263, 2, '00') // version
  const checksum = block.reduce((sum, byte) => sum + byte, 0)
  writeString(block, 148, 7, checksum.toString(8).padStart(6, '0') + '\0')
  return block
}

export function createTar(entries: readonly TarEntry[], mtimeSeconds = 0): Uint8Array<ArrayBuffer> {
  const seen = new Set<string>()
  for (const entry of entries) {
    assertSafeName(entry.name)
    if (seen.has(entry.name)) throw new TarNameError(`Duplicate file name for compile: "${entry.name}"`)
    seen.add(entry.name)
  }
  assertNoFileFolderClash(seen)

  const dataBlocks = (size: number) => Math.ceil(size / BLOCK) * BLOCK
  const total =
    entries.reduce((sum, e) => sum + BLOCK + dataBlocks(e.bytes.length), 0) + BLOCK * 2
  const tar = new Uint8Array(total)
  let offset = 0
  for (const entry of entries) {
    tar.set(header(entry.name, entry.bytes.length, mtimeSeconds), offset)
    offset += BLOCK
    tar.set(entry.bytes, offset)
    offset += dataBlocks(entry.bytes.length)
  }
  // The two trailing zero blocks are already zero-filled.
  return tar
}
