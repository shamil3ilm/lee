'use client'
import { useRef, useState, type ChangeEvent, type RefObject } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { isZipFile, ZIP_ACCEPT } from '@/lib/latex/project/file-types'
import type { EditorImportResult, ZipImportTarget } from './zip-import-dialog'

// The review dialog (and fflate with it) loads only when a zip is chosen.
const ZipImportDialog = dynamic(() => import('./zip-import-dialog'), { ssr: false, loading: () => null })

interface ZipImportHostProps {
  file: File | null
  target: ZipImportTarget
  onClose: () => void
  onImported?: (result: EditorImportResult) => void
}

export function ZipImportHost({ file, target, onClose, onImported }: ZipImportHostProps) {
  if (!file) return null
  return <ZipImportDialog file={file} target={target} onClose={onClose} onImported={onImported} />
}

/** A hidden .zip input plus the chosen file. */
export function useZipPicker(): {
  file: File | null
  setFile: (f: File | null) => void
  open: () => void
  /** Accept dropped files: true when one was a .zip (it is taken). */
  takeDropped: (files: FileList | readonly File[]) => boolean
  inputRef: RefObject<HTMLInputElement | null>
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void
} {
  const [file, setFile] = useState<File | null>(null)
  const ref = useRef<HTMLInputElement | null>(null)
  return {
    file,
    setFile,
    open: () => ref.current?.click(),
    takeDropped: (files) => {
      const list = Array.from(files)
      const zip = list.find((f) => isZipFile(f))
      if (!zip) return false
      if (list.filter((f) => isZipFile(f)).length > 1) toast.info('One project at a time: importing the first zip.')
      setFile(zip)
      return true
    },
    inputRef: ref,
    onInputChange: (e) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (f) setFile(f)
    },
  }
}

/** The hidden file input for `useZipPicker`. */
export function ZipInput({
  inputRef,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ZIP_ACCEPT}
      onChange={onChange}
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
      data-testid="zip-import-input"
    />
  )
}
