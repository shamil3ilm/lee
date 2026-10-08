'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { uploadAsset } from '@/components/drive/asset-upload'
import { isTextFile, MAIN_FILE, mimeForFile } from '@/lib/latex/file-kinds'
import { assetUrl, basename } from '@/lib/latex/project/paths'

/**
 * The project's files: main.tex (the document source, owned by the editor)
 * and the document assets. Text assets (.tex, .bib, .sty, .cls) open in
 * tabs and are edited in place; a change is saved by replacing the asset
 * (delete + upload; the old text is put back if the upload fails).
 */

interface TextFile {
  value: string
  saved: string
  loading: boolean
}

export const TEXT_SAVE_DELAY_MS = 1500

function textFile(name: string, text: string): File {
  return new File([text], basename(name), { type: mimeForFile(name, '') })
}

export function useProjectFiles(documentId: string, initialAssets: AssetMetadata[]) {
  const [assets, setAssets] = useState<AssetMetadata[]>(initialAssets)
  const [tabs, setTabs] = useState<string[]>([MAIN_FILE])
  const [active, setActive] = useState<string>(MAIN_FILE)
  const [texts, setTexts] = useState<Record<string, TextFile>>({})
  const [busy, setBusy] = useState(false)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const textsRef = useRef(texts)
  useEffect(() => {
    textsRef.current = texts
  }, [texts])

  const upload = useCallback(
    async (files: readonly File[]): Promise<AssetMetadata[]> => {
      if (files.length === 0) return []
      setBusy(true)
      try {
        const created: AssetMetadata[] = []
        for (const file of files) {
          const named = file.type ? file : new File([file], file.name, { type: mimeForFile(file.name, '') })
          const out = await uploadAsset(documentId, named)
          if (out.asset) created.push(out.asset)
          else toast.error(`${file.name}: ${out.error ?? 'Upload failed.'}`)
        }
        if (created.length > 0) setAssets((a) => [...a, ...created])
        return created
      } finally {
        setBusy(false)
      }
    },
    [documentId],
  )

  const remove = useCallback(
    async (filename: string): Promise<boolean> => {
      const pending = timers.current.get(filename)
      if (pending) clearTimeout(pending)
      timers.current.delete(filename)
      const res = await fetch(assetUrl(documentId, filename), { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) {
        toast.error(`Could not delete ${filename}.`)
        return false
      }
      setAssets((a) => a.filter((x) => x.filename !== filename))
      setTabs((t) => t.filter((x) => x !== filename))
      setActive((cur) => (cur === filename ? MAIN_FILE : cur))
      setTexts(({ [filename]: _gone, ...rest }) => rest)
      return true
    },
    [documentId],
  )

  const open = useCallback(
    async (filename: string): Promise<void> => {
      if (filename !== MAIN_FILE && !isTextFile(filename)) return
      setTabs((t) => (t.includes(filename) ? t : [...t, filename]))
      setActive(filename)
      if (filename === MAIN_FILE || textsRef.current[filename]) return
      setTexts((t) => ({ ...t, [filename]: { value: '', saved: '', loading: true } }))
      const res = await fetch(assetUrl(documentId, filename)).catch(() => null)
      const text = res?.ok ? await res.text() : null
      if (text === null) toast.error(`Could not open ${filename}.`)
      setTexts((t) => ({ ...t, [filename]: { value: text ?? '', saved: text ?? '', loading: false } }))
    },
    [documentId],
  )

  const close = useCallback((filename: string) => {
    if (filename === MAIN_FILE) return
    setTabs((t) => t.filter((x) => x !== filename))
    setActive((cur) => (cur === filename ? MAIN_FILE : cur))
  }, [])

  /** Replace a text asset with its edited text. */
  const saveText = useCallback(
    async (filename: string): Promise<void> => {
      const file = textsRef.current[filename]
      if (!file || file.value === file.saved) return
      const value = file.value
      const deleted = await fetch(assetUrl(documentId, filename), { method: 'DELETE' }).catch(() => null)
      if (!deleted?.ok) {
        toast.error(`Could not save ${filename}.`)
        return
      }
      const out = await uploadAsset(documentId, textFile(filename, value), filename)
      if (!out.asset) {
        await uploadAsset(documentId, textFile(filename, file.saved), filename)
        toast.error(`Could not save ${filename}: ${out.error ?? 'upload failed'}.`)
        return
      }
      const asset = out.asset
      setAssets((a) => a.map((x) => (x.filename === filename ? asset : x)))
      setTexts((t) => ({ ...t, [filename]: { ...t[filename]!, saved: value } }))
    },
    [documentId],
  )

  const setText = useCallback(
    (filename: string, value: string) => {
      setTexts((t) => ({ ...t, [filename]: { ...(t[filename] ?? { saved: '', loading: false }), value } }))
      const prev = timers.current.get(filename)
      if (prev) clearTimeout(prev)
      timers.current.set(
        filename,
        setTimeout(() => void saveText(filename), TEXT_SAVE_DELAY_MS),
      )
    },
    [saveText],
  )

  /** Save every edited text asset now (before a compile). */
  const flushTexts = useCallback(async (): Promise<void> => {
    for (const [name, t] of timers.current) {
      clearTimeout(t)
      timers.current.delete(name)
      await saveText(name)
    }
  }, [saveText])

  const create = useCallback(
    async (filename: string): Promise<boolean> => {
      // Uploads must not be empty: start the file with a comment line.
      const header = `% ${filename}\n`
      const created = await upload([textFile(filename, header)])
      if (created.length === 0) return false
      setTexts((t) => ({ ...t, [filename]: { value: header, saved: header, loading: false } }))
      setTabs((t) => [...t, filename])
      setActive(filename)
      return true
    },
    [upload],
  )

  /** Drop files deleted elsewhere (a project import): tabs, cached text, pending saves. */
  const forget = useCallback((filenames: readonly string[]) => {
    if (filenames.length === 0) return
    const gone = new Set(filenames)
    for (const name of gone) {
      const pending = timers.current.get(name)
      if (pending) clearTimeout(pending)
      timers.current.delete(name)
    }
    setAssets((a) => a.filter((x) => !gone.has(x.filename)))
    setTabs((t) => t.filter((x) => !gone.has(x)))
    setActive((cur) => (gone.has(cur) ? MAIN_FILE : cur))
    setTexts((t) => Object.fromEntries(Object.entries(t).filter(([name]) => !gone.has(name))))
  }, [])

  const dirtyTexts = Object.entries(texts)
    .filter(([, t]) => t.value !== t.saved)
    .map(([name]) => name)

  return {
    assets,
    setAssets,
    tabs,
    active,
    setActive,
    texts,
    busy,
    dirtyTexts,
    open,
    close,
    upload,
    remove,
    forget,
    create,
    setText,
    flushTexts,
  }
}

export type ProjectFiles = ReturnType<typeof useProjectFiles>
