import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/documentAssets'
import * as docsQ from '@/lib/db/queries/documents'
import { makeUser } from '@/tests/factories'

async function seedDoc(email = `assets-${Math.random()}@x.com`) {
  const u = await makeUser(email)
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'CV',
    content: { source: '\\documentclass{article}\\begin{document}x\\end{document}' },
  })
  return { u, doc }
}

function buf(...bytes: number[]): Buffer {
  return Buffer.from(bytes)
}

describe('documentAssets queries', () => {
  it('create + list returns metadata without bytes', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      bytes: buf(0xff, 0xd8, 0xff),
    })
    const listed = await q.list(u.id, doc.id)
    expect(listed).toHaveLength(1)
    const row = listed[0]!
    expect(row.filename).toBe('photo.jpg')
    expect(row.mimeType).toBe('image/jpeg')
    expect(row.sizeBytes).toBe(3)
    // Type-level: list rows must NOT include bytes.
    expect(row).not.toHaveProperty('bytes')
  })

  it('get returns bytes; get scoped by user', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      bytes: buf(0x89, 0x50, 0x4e, 0x47),
    })
    const fetched = await q.get(u.id, doc.id, 'photo.png')
    expect(fetched).not.toBeNull()
    expect(fetched!.bytes).toEqual(buf(0x89, 0x50, 0x4e, 0x47))

    const other = await makeUser('other-asset@x.com')
    expect(await q.get(other.id, doc.id, 'photo.png')).toBeNull()
  })

  it('getById returns bytes and scopes by userId', async () => {
    const { u, doc } = await seedDoc()
    const created = await q.create(u.id, doc.id, {
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2,
      bytes: buf(1, 2),
    })
    const row = await q.getById(u.id, created.id)
    expect(row?.bytes).toEqual(buf(1, 2))
    const other = await makeUser('other-getbyid@x.com')
    expect(await q.getById(other.id, created.id)).toBeNull()
  })

  it('listWithBytes returns all assets with bytes', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(1),
    })
    await q.create(u.id, doc.id, {
      filename: 'b.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      bytes: buf(2),
    })
    const rows = await q.listWithBytes(u.id, doc.id)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.bytes!.length).toBeGreaterThan(0)
    expect(rows[1]!.bytes!.length).toBeGreaterThan(0)
  })

  it('sanitizes filenames on create', async () => {
    const { u, doc } = await seedDoc()
    const asset = await q.create(u.id, doc.id, {
      filename: '../../etc/../photo of me.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(1),
    })
    // Directory prefix stripped, spaces -> underscore, traversal collapsed.
    expect(asset.filename).not.toContain('/')
    expect(asset.filename).not.toContain('..')
    expect(asset.filename).not.toContain(' ')
    expect(asset.filename.toLowerCase()).toContain('photo_of_me')
  })

  it('enforces filename uniqueness per document', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'dup.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(1),
    })
    await expect(
      q.create(u.id, doc.id, {
        filename: 'dup.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        bytes: buf(2),
      }),
    ).rejects.toBeInstanceOf(q.AssetValidationError)
  })

  it('rejects files larger than MAX_ASSET_BYTES', async () => {
    const { u, doc } = await seedDoc()
    await expect(
      q.create(u.id, doc.id, {
        filename: 'big.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: q.MAX_ASSET_BYTES + 1,
        bytes: buf(1),
      }),
    ).rejects.toMatchObject({ code: 'file_too_large' })
  })

  it('rejects more than MAX_ASSETS_PER_DOCUMENT', async () => {
    const { u, doc } = await seedDoc()
    for (let i = 0; i < q.MAX_ASSETS_PER_DOCUMENT; i++) {
      await q.create(u.id, doc.id, {
        filename: `f${i}.bin`,
        mimeType: 'application/octet-stream',
        sizeBytes: 1,
        bytes: buf(i),
      })
    }
    await expect(
      q.create(u.id, doc.id, {
        filename: 'one-too-many.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: 1,
        bytes: buf(0),
      }),
    ).rejects.toMatchObject({ code: 'too_many_assets' })
  })

  it('remove deletes the asset', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'del.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(1),
    })
    expect(await q.remove(u.id, doc.id, 'del.jpg')).toBe(true)
    expect(await q.get(u.id, doc.id, 'del.jpg')).toBeNull()
    expect(await q.remove(u.id, doc.id, 'del.jpg')).toBe(false)
  })

  it('renameFile changes the filename and detects conflicts', async () => {
    const { u, doc } = await seedDoc()
    await q.create(u.id, doc.id, {
      filename: 'old.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(1),
    })
    await q.create(u.id, doc.id, {
      filename: 'other.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: buf(2),
    })
    const renamed = await q.renameFile(u.id, doc.id, 'old.jpg', 'new.jpg')
    expect(renamed?.filename).toBe('new.jpg')
    expect(await q.get(u.id, doc.id, 'old.jpg')).toBeNull()

    // Conflict with an existing filename.
    await expect(
      q.renameFile(u.id, doc.id, 'new.jpg', 'other.jpg'),
    ).rejects.toMatchObject({ code: 'filename_conflict' })
  })

  it('sanitizeFilename standalone behaviour', () => {
    expect(q.sanitizeFilename(' photo of me.jpg ')).toBe('photo_of_me.jpg')
    expect(q.sanitizeFilename('../../etc/passwd')).not.toContain('..')
    expect(q.sanitizeFilename('C:\\Users\\a\\pic.png')).toBe('pic.png')
    expect(q.sanitizeFilename('  ')).toBe('')
    expect(q.sanitizeFilename('weird@name!.txt')).toBe('weird_name_.txt')
  })
})
