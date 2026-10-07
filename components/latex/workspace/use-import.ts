'use client'
import { useCallback, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { defaultSnippetForAsset } from '@/lib/latex/snippets'
import { fileKind, MAIN_FILE } from '@/lib/latex/file-kinds'
import type { ProjectFiles } from './use-project-files'

interface UseImportOptions {
  files: ProjectFiles
  /** The hidden file input the Import / Upload buttons click. */
  inputRef: RefObject<HTMLInputElement | null>
  /** Replace main.tex's text in the editor (undoable). */
  replaceMain: (text: string) => void
  /** Insert a snippet into the open file (at `pos` when dropped). */
  insertSnippet: (snippet: string, pos: number | null) => void
}

/**
 * Import / upload: a .tex file asks whether to replace main.tex or become a
 * separate file; everything else becomes an asset. Dropping an image on the
 * code also inserts its \includegraphics snippet where it landed.
 */
export function useImport({ files, inputRef, replaceMain, insertSnippet }: UseImportOptions) {
  const [pendingTex, setPendingTex] = useState<File | null>(null)
  const queue = useRef<File[]>([])

  const nextTex = useCallback(() => setPendingTex(queue.current.shift() ?? null), [])

  const importFiles = useCallback(
    async (list: FileList | readonly File[], dropPos: number | null = null): Promise<void> => {
      const all = Array.from(list)
      const tex = all.filter((f) => fileKind(f.name) === 'tex')
      const rest = all.filter((f) => fileKind(f.name) !== 'tex')
      if (tex.length > 0) {
        queue.current.push(...tex)
        if (!pendingTex) nextTex()
      }
      const created = await files.upload(rest)
      if (created.length > 0) {
        toast.success(created.length === 1 ? `Added ${created[0]!.filename}` : `Added ${created.length} files`)
        if (dropPos !== null) created.forEach((a, i) => insertSnippet(defaultSnippetForAsset(a), i === 0 ? dropPos : null))
      }
    },
    [files, insertSnippet, nextTex, pendingTex],
  )

  const taken = (name: string) => name === MAIN_FILE || files.assets.some((a) => a.filename === name)
  const separateName = pendingTex && !taken(pendingTex.name) ? pendingTex.name : null

  const replace = useCallback(async () => {
    if (!pendingTex) return
    const text = await pendingTex.text()
    replaceMain(text)
    toast.success(`main.tex replaced with ${pendingTex.name}`)
    nextTex()
  }, [pendingTex, replaceMain, nextTex])

  const add = useCallback(async () => {
    if (!pendingTex) return
    const created = await files.upload([pendingTex])
    if (created[0]) void files.open(created[0].filename)
    nextTex()
  }, [pendingTex, files, nextTex])

  const cancel = useCallback(() => {
    queue.current = []
    setPendingTex(null)
  }, [])

  return {
    openPicker: () => inputRef.current?.click(),
    importFiles,
    dialog: { file: pendingTex, separateName, onReplace: () => void replace(), onAdd: () => void add(), onCancel: cancel },
  }
}
