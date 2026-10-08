'use client'
import { useState, type DragEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, FileArchive, FilePlus2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useZipPicker, ZipImportHost, ZipInput } from '@/components/latex/project-import/zip-import-host'
import { cn } from '@/lib/utils'

const NEW_TARGET = { kind: 'new' } as const

/** The Documents page's New menu: a LaTeX CV from a template, or an imported project (.zip). */
export function DocumentsNewMenu() {
  const zip = useZipPicker()
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" />
            New
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/documents/new/latex">
              <FilePlus2 className="size-4" /> New LaTeX CV
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={zip.open}>
            <FileArchive className="size-4" /> Import project (.zip)…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ZipInput inputRef={zip.inputRef} onChange={zip.onInputChange} />
      <ZipImportHost file={zip.file} target={NEW_TARGET} onClose={() => zip.setFile(null)} />
    </>
  )
}

/** Drop a project .zip anywhere on the documents list to import it. */
export function DocumentsZipDropZone({ children }: { children: ReactNode }) {
  const zip = useZipPicker()
  const [over, setOver] = useState(false)
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      className={cn('relative rounded-lg', over && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        zip.takeDropped(e.dataTransfer.files)
      }}
      data-testid="documents-drop-zone"
    >
      {children}
      {over ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/10 backdrop-blur-[1px]">
          <p className="rounded-md bg-background/95 px-4 py-2 text-sm font-medium shadow">Drop a .zip to import a LaTeX project</p>
        </div>
      ) : null}
      <ZipImportHost file={zip.file} target={NEW_TARGET} onClose={() => zip.setFile(null)} />
    </div>
  )
}
