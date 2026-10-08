'use client'
import { useState, type DragEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { fileKind, isTextFile, MAIN_FILE, validateNewFileName } from '@/lib/latex/file-kinds'
import type { OutlineItem } from '@/lib/latex/outline'
import { treeRows, visibleRows } from '@/lib/latex/project/tree'
import { cn } from '@/lib/utils'
import { OutlinePanel } from '@/components/latex/outline-panel'
import { IconButton } from './icon-button'

interface FilesPanelProps {
  assets: readonly AssetMetadata[]
  active: string
  busy: boolean
  outline: readonly OutlineItem[]
  onOpen: (filename: string) => void
  onDelete: (filename: string) => void
  onCreate: (filename: string) => Promise<boolean>
  onUpload: () => void
  onImportZip: () => void
  onDropFiles: (files: FileList) => void
  onJump: (line: number) => void
}

function FileIcon({ name }: { name: string }) {
  const kind = fileKind(name)
  if (kind === 'image') return <FileImage className="size-3.5 shrink-0 text-muted-foreground" />
  if (kind === 'pdf') return <FileType className="size-3.5 shrink-0 text-muted-foreground" />
  if (kind === 'other') return <FileText className="size-3.5 shrink-0 text-muted-foreground" />
  return <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
}

function order(a: string, b: string): number {
  const rank = (n: string) => (isTextFile(n) ? 0 : fileKind(n) === 'image' ? 1 : 2)
  return rank(a) - rank(b) || a.localeCompare(b)
}

/**
 * The Files panel: main.tex and every asset as a folder tree (an imported
 * project keeps its folders; both compile services take them), with new
 * file / upload / import project / delete and drag-and-drop upload (a .zip
 * dropped here is imported as a project); below it, the File outline of the
 * open file.
 */
export function FilesPanel(p: FilesPanelProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const rows = visibleRows(treeRows(p.assets.map((a) => a.filename), order), collapsed)
  const toggleFolder = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  async function submitNew(): Promise<void> {
    const error = validateNewFileName(name, p.assets.map((a) => a.filename))
    setNameError(error)
    if (error) return
    if (await p.onCreate(name.trim())) {
      setCreating(false)
      setName('')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) p.onDropFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <section
        aria-label="Files"
        className={cn('flex min-h-0 flex-col', outlineOpen ? 'max-h-[55%]' : 'flex-1', dragOver && 'bg-primary/5 ring-2 ring-inset ring-primary')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex h-8 shrink-0 items-center justify-between border-b pl-3 pr-1">
          <h2 className="font-semibold text-muted-foreground">Files</h2>
          <div className="flex items-center">
            {p.busy ? <Loader2 className="mr-1 size-3.5 animate-spin text-muted-foreground" aria-label="Uploading" /> : null}
            <IconButton label="New file" tip="New .tex, .bib, .sty or .cls file" onClick={() => setCreating((v) => !v)} pressed={creating}>
              <FilePlus2 />
            </IconButton>
            <IconButton label="Upload files" tip="Upload or import files (or drop them here)" onClick={p.onUpload}>
              <Upload />
            </IconButton>
            <IconButton label="Import project (.zip)" tip="Import a LaTeX project .zip (e.g. from Overleaf)" onClick={p.onImportZip}>
              <FileArchive />
            </IconButton>
          </div>
        </div>
        {creating ? (
          <form
            className="border-b p-2"
            onSubmit={(e) => {
              e.preventDefault()
              void submitNew()
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="chapter.tex"
              aria-label="New file name"
              aria-invalid={nameError !== null}
              className="h-7 w-full rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {nameError ? <p className="mt-1 text-destructive">{nameError}</p> : null}
          </form>
        ) : null}
        <ul className="min-h-0 overflow-y-auto py-1" aria-label="Project files">
          {[{ type: 'file' as const, path: MAIN_FILE, name: MAIN_FILE, depth: 0 }, ...rows].map((row) => {
            const indent = { paddingLeft: `${0.75 + row.depth * 0.875}rem` }
            if (row.type === 'folder') {
              const open = !collapsed.has(row.path)
              return (
                <li key={`dir:${row.path}`} className="flex items-center pr-1">
                  <button
                    type="button"
                    onClick={() => toggleFolder(row.path)}
                    aria-expanded={open}
                    title={row.path}
                    style={indent}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pr-3 text-left text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className="size-3.5 shrink-0" />}
                    <span className="truncate font-medium">{row.name}</span>
                  </button>
                </li>
              )
            }
            const filename = row.path
            const openable = filename === MAIN_FILE || isTextFile(filename)
            return (
              <li key={filename} className="group flex items-center pr-1">
                <button
                  type="button"
                  onClick={() => openable && p.onOpen(filename)}
                  aria-current={p.active === filename ? 'true' : undefined}
                  aria-label={filename}
                  title={openable ? `Open ${filename}` : `${filename} (bundled with the document at compile time)`}
                  style={indent}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    p.active === filename ? 'bg-primary/10 font-medium text-foreground' : 'hover:bg-muted',
                    !openable && 'cursor-default text-muted-foreground',
                  )}
                >
                  <FileIcon name={filename} />
                  <span className="truncate">{row.name}</span>
                </button>
                {filename !== MAIN_FILE ? (
                  <IconButton
                    label={`Delete ${filename}`}
                    side="right"
                    onClick={() => p.onDelete(filename)}
                    className="size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 />
                  </IconButton>
                ) : null}
              </li>
            )
          })}
        </ul>
        {p.assets.length === 0 ? (
          <p className="px-3 pb-2 text-muted-foreground">Drop images, .bib or .tex files, or a project .zip, here.</p>
        ) : null}
      </section>
      <div className="flex min-h-0 flex-1 flex-col border-t">
        <button
          type="button"
          onClick={() => setOutlineOpen((v) => !v)}
          aria-expanded={outlineOpen}
          className="flex h-8 shrink-0 items-center gap-1 px-2 text-left font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {outlineOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          File outline
        </button>
        {outlineOpen ? (
          <div className="min-h-0 flex-1">
            <OutlinePanel items={p.outline} onJump={p.onJump} hideHeading />
          </div>
        ) : null}
      </div>
    </div>
  )
}
