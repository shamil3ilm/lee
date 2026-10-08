'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, FileArchive, Folder, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { COMPILE_ENGINES, ENGINE_LABELS, SERVICE_LABELS, type CompileEngine, type CompileService } from '@/lib/latex/compile-settings'
import { MAIN_FILE } from '@/lib/latex/file-kinds'
import { formatBytes } from '@/lib/latex/project/format'
import { MAX_ASSET_BYTES, MAX_ASSETS_PER_DOCUMENT, SERVER_UPLOAD_MAX_BYTES } from '@/lib/latex/project/limits'
import { planImport, type ImportMode, type ImportPlan } from '@/lib/latex/project/plan'
import { treeRows } from '@/lib/latex/project/tree'
import { readZipProject, ZipImportError, type ZipScan } from '@/lib/latex/project/zip-read'
import { fetchDriveStatus } from '@/components/drive/asset-upload'
import { createImportedLatexDocument, saveImportedProjectMeta } from '@/app/(authed)/documents/import-actions'
import { cn } from '@/lib/utils'
import { deleteAssets, storePlannedFiles, type StoreFailure } from './store-plan'
import { saveImportReport, type ImportReportItem } from './report-store'

/**
 * "Import project (.zip)": unzip in the browser, validate, show a review
 * (file tree, sizes, main file, compiler, warnings, renames, skipped files),
 * then store it. Loaded on demand (next/dynamic), so fflate never ships in
 * the initial editor or Documents bundle.
 */

export type ZipImportTarget = { kind: 'new' } | { kind: 'editor'; documentId: string; assets: readonly AssetMetadata[] }

/** Handed back to the editor after an import into the open document. */
export interface EditorImportResult {
  mode: Exclude<ImportMode, 'new'>
  /** New text for main.tex (replace only). */
  source: string | null
  mainFile: string | null
  engine: CompileEngine | null
  service: CompileService | null
  created: AssetMetadata[]
  removed: string[]
  report: ImportReportItem[]
}

interface ZipImportDialogProps {
  file: File
  target: ZipImportTarget
  onClose: () => void
  onImported?: (result: EditorImportResult) => void
}

type Phase =
  | { kind: 'reading' }
  | { kind: 'error'; message: string }
  | { kind: 'review'; scan: ZipScan }
  | { kind: 'importing'; scan: ZipScan; step: string; done: number; total: number }

const REASON_TEXT: Record<string, string> = {
  'root-setting': 'from the project’s root setting',
  'main.tex': 'detected',
  'only-candidate': 'the only file with \\documentclass',
}

function reportItems(plan: ImportPlan, failures: readonly StoreFailure[]): ImportReportItem[] {
  return [
    ...plan.missing.map((m) => ({ message: `\\${m.command}{${m.arg}}: no such file in the project`, file: m.file, line: m.line })),
    ...failures.map((f) => ({ message: `${f.path} was not stored: ${f.error}`, file: undefined, line: undefined })),
  ]
}

export default function ZipImportDialog({ file, target, onClose, onImported }: ZipImportDialogProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: 'reading' })
  const [maxFileBytes, setMaxFileBytes] = useState(SERVER_UPLOAD_MAX_BYTES)
  const [mode, setMode] = useState<ImportMode>(target.kind === 'new' ? 'new' : 'replace')
  const [mainChoice, setMainChoice] = useState<string | null>(null)
  const [engineChoice, setEngineChoice] = useState<CompileEngine | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [bytes, drive] = await Promise.all([file.arrayBuffer(), fetchDriveStatus()])
        if (cancelled) return
        if (drive?.backend === 'drive') setMaxFileBytes(MAX_ASSET_BYTES)
        setPhase({ kind: 'review', scan: readZipProject(new Uint8Array(bytes)) })
      } catch (err) {
        if (cancelled) return
        setPhase({ kind: 'error', message: err instanceof ZipImportError ? err.message : 'This zip could not be read.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  const existing = useMemo(() => (target.kind === 'editor' ? target.assets.map((a) => a.filename) : []), [target])
  const scan = phase.kind === 'review' || phase.kind === 'importing' ? phase.scan : null
  const plan = useMemo(() => {
    if (!scan) return null
    const keep = mode === 'add' ? existing.length : 0
    return planImport(scan, {
      mode,
      mainPath: mainChoice,
      existingPaths: mode === 'add' ? existing : [],
      maxFileBytes,
      maxFiles: MAX_ASSETS_PER_DOCUMENT - keep,
    })
  }, [scan, mode, mainChoice, existing, maxFileBytes])
  const engine = engineChoice ?? plan?.settings?.engine ?? 'pdflatex'
  const importing = phase.kind === 'importing'

  async function run(): Promise<void> {
    if (!plan || !scan || plan.errors.length > 0) return
    const progress = (step: string) => (done: number, total: number) => setPhase({ kind: 'importing', scan, step, done, total })
    const settings = plan.settings ? { engine, ...(plan.settings.service ? { service: plan.settings.service } : {}) } : undefined
    try {
      if (target.kind === 'new') {
        progress('Creating the document')(0, plan.files.length)
        const title = file.name.replace(/\.zip$/i, '').trim().slice(0, 200) || 'Imported project'
        const created = await createImportedLatexDocument({ title, source: plan.main!.source, mainFile: plan.main!.from, settings })
        if ('error' in created) {
          toast.error(created.error)
          setPhase({ kind: 'review', scan })
          return
        }
        const out = await storePlannedFiles(created.documentId, plan.files, progress('Uploading'))
        saveImportReport(created.documentId, reportItems(plan, out.failures))
        if (out.failures.length > 0) toast.warning(`${out.failures.length} file${out.failures.length === 1 ? '' : 's'} could not be stored.`)
        router.push(`/documents/${created.documentId}/edit?compile=1`)
        return
      }
      let removed: string[] = []
      if (mode === 'replace') {
        progress('Removing the current files')(0, plan.files.length)
        const failed = await deleteAssets(target.documentId, existing)
        removed = existing.filter((p) => !failed.includes(p))
        if (failed.length > 0) {
          toast.error(`Could not remove ${failed.join(', ')}; nothing else was changed.`)
          onImported?.({ mode: 'replace', source: null, mainFile: null, engine: null, service: null, created: [], removed, report: [] })
          onClose()
          return
        }
        const meta = await saveImportedProjectMeta({ documentId: target.documentId, mainFile: plan.main!.from, settings })
        if ('error' in meta) toast.error(meta.error)
      }
      const out = await storePlannedFiles(target.documentId, plan.files, progress('Uploading'))
      if (out.failures.length > 0) toast.warning(`${out.failures.length} file${out.failures.length === 1 ? '' : 's'} could not be stored.`)
      else toast.success(`Imported ${out.created.length} file${out.created.length === 1 ? '' : 's'}`)
      onImported?.({
        mode: mode === 'add' ? 'add' : 'replace',
        source: mode === 'replace' ? plan.main!.source : null,
        mainFile: mode === 'replace' ? plan.main!.from : null,
        engine: mode === 'replace' ? engine : null,
        service: mode === 'replace' ? (plan.settings?.service ?? null) : null,
        created: out.created,
        removed,
        report: reportItems(plan, out.failures),
      })
      onClose()
    } catch {
      toast.error('The import stopped before it finished. Check the files panel and try again.')
      setPhase({ kind: 'review', scan })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !importing && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-3 overflow-hidden p-0" data-testid="zip-import-dialog">
        <DialogHeader className="border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Import LaTeX project
          </DialogTitle>
          <DialogDescription className="break-all">
            {file.name} · {formatBytes(file.size)}
            {plan ? ` · ${plan.files.length + (plan.main ? 1 : 0)} files, ${formatBytes(plan.totalBytes)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 text-sm">
          {phase.kind === 'reading' ? (
            <p className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading the zip…
            </p>
          ) : null}
          {phase.kind === 'error' ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {phase.message}
            </p>
          ) : null}
          {plan ? (
            <ReviewBody
              plan={plan}
              target={target}
              mode={mode}
              onMode={setMode}
              mainChoice={mainChoice ?? plan.main?.from ?? ''}
              onMain={(m) => setMainChoice(m || null)}
              engine={engine}
              onEngine={setEngineChoice}
              existingCount={existing.length}
              disabled={importing}
            />
          ) : null}
        </div>

        <DialogFooter className="flex-col-reverse items-stretch gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {phase.kind === 'importing' ? `${phase.step}… ${phase.done} of ${phase.total}` : ''}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void run()}
              disabled={!plan || plan.errors.length > 0 || importing}
              data-testid="zip-import-confirm"
            >
              {importing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {plan ? importLabel(plan, mode) : 'Import'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function importLabel(plan: ImportPlan, mode: ImportMode): string {
  const n = plan.files.length + (plan.main ? 1 : 0)
  const files = `${n} file${n === 1 ? '' : 's'}`
  return mode === 'replace' ? `Replace with ${files}` : mode === 'add' ? `Add ${files}` : `Import ${files}`
}

interface ReviewBodyProps {
  plan: ImportPlan
  target: ZipImportTarget
  mode: ImportMode
  onMode: (m: ImportMode) => void
  mainChoice: string
  onMain: (path: string) => void
  engine: CompileEngine
  onEngine: (e: CompileEngine) => void
  existingCount: number
  disabled: boolean
}

function ReviewBody(p: ReviewBodyProps) {
  const { plan } = p
  const renamedFrom = new Map(plan.renames.map((r) => [r.to, r.from]))
  const sizes = new Map(plan.files.map((f) => [f.path, f.bytes.byteLength]))
  const rewritten = new Set(plan.files.filter((f) => f.rewritten).map((f) => f.path))
  const rows = treeRows(plan.files.map((f) => f.path))

  return (
    <>
      {p.target.kind === 'editor' ? (
        <fieldset className="space-y-2" disabled={p.disabled}>
          <legend className="mb-1 font-medium">Into this document</legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="zip-mode" className="mt-1" checked={p.mode === 'replace'} onChange={() => p.onMode('replace')} />
            <span>
              <span className="font-medium">Replace project</span>
              <span className="block text-xs text-muted-foreground">
                main.tex becomes the zip’s main file (undo with Ctrl/⌘+Z) and the {p.existingCount} current file
                {p.existingCount === 1 ? ' is' : 's are'} deleted.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="zip-mode" className="mt-1" checked={p.mode === 'add'} onChange={() => p.onMode('add')} />
            <span>
              <span className="font-medium">Add files</span>
              <span className="block text-xs text-muted-foreground">Keeps main.tex and every file; names already here are skipped.</span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {plan.errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">
          {plan.errors.map((e) => (
            <li key={e} className="flex items-start gap-2">
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {e}
            </li>
          ))}
        </ul>
      ) : null}

      {p.mode !== 'add' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block font-medium">Main file</span>
            {plan.detection.candidates.length > 1 ? (
              <NativeSelect value={p.mainChoice} onChange={(e) => p.onMain(e.target.value)} disabled={p.disabled} aria-label="Main file">
                {plan.detection.reason === 'choose' ? <option value="">Choose the main file…</option> : null}
                {plan.detection.candidates.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <span className="block truncate rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-xs">{plan.main?.from ?? '—'}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              {plan.detection.reason === 'choose'
                ? `${plan.detection.candidates.length} files have \\documentclass; pick the one to compile.`
                : plan.main
                  ? `${REASON_TEXT[plan.detection.reason] ?? 'chosen'}${plan.detection.rootSource ? ` (${plan.detection.rootSource})` : ''}; compiles as ${MAIN_FILE}.`
                  : ''}
            </span>
          </label>
          <label className="space-y-1">
            <span className="block font-medium">Compiler</span>
            <NativeSelect value={p.engine} onChange={(e) => p.onEngine(e.target.value as CompileEngine)} disabled={p.disabled} aria-label="Compiler">
              {COMPILE_ENGINES.map((e) => (
                <option key={e} value={e}>
                  {ENGINE_LABELS[e]}
                </option>
              ))}
            </NativeSelect>
            <span className="block text-xs text-muted-foreground">{plan.engine.detail}</span>
          </label>
          {plan.bib.detail ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Bibliography: {plan.bib.detail}
              {plan.settings?.service ? ` (${SERVICE_LABELS[plan.settings.service]})` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning" aria-label="Warnings">
          {plan.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{w.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Files to import">
        <h3 className="mb-1 font-medium">Files</h3>
        <ul className="rounded-md border py-1 text-xs" data-testid="zip-import-tree">
          {plan.main ? (
            <li className="flex items-center gap-2 px-2 py-1">
              <span className="min-w-0 flex-1 truncate font-mono">{MAIN_FILE}</span>
              {plan.main.from !== MAIN_FILE ? <Badge variant="info">from {plan.main.from}</Badge> : <Badge variant="neutral">main</Badge>}
            </li>
          ) : null}
          {rows.map((r) => (
            <li key={`${r.type}:${r.path}`} className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: `${0.5 + r.depth * 1}rem` }}>
              {r.type === 'folder' ? <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
              <span className={cn('min-w-0 flex-1 truncate font-mono', r.type === 'folder' && 'font-medium')}>
                {r.type === 'folder' ? `${r.name}/` : r.name}
              </span>
              {r.type === 'file' && renamedFrom.has(r.path) ? <Badge variant="warning">renamed</Badge> : null}
              {r.type === 'file' && rewritten.has(r.path) ? <Badge variant="info">refs updated</Badge> : null}
              {r.type === 'file' ? <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(sizes.get(r.path) ?? 0)}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      {plan.renames.length + plan.rewrites.length > 0 ? (
        <details className="rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Renamed and rewritten ({plan.renames.length + plan.rewrites.length})</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {plan.renames.map((r) => (
              <li key={`r:${r.from}`} className="break-all">
                {r.from} → {r.to}
              </li>
            ))}
            {plan.rewrites.map((w, i) => (
              <li key={`w:${i}`} className="break-all text-muted-foreground">
                {w.file}:{w.line} \{w.command}{'{'}
                {w.from}
                {'}'} → {'{'}
                {w.to}
                {'}'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {plan.skipped.length > 0 ? (
        <details className="mb-4 rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Skipped ({plan.skipped.length})</summary>
          <ul className="mt-2 space-y-1">
            {plan.skipped.map((s) => (
              <li key={s.path} className="flex flex-wrap gap-x-2">
                <span className="break-all font-mono">{s.path}</span>
                <span className="text-muted-foreground">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <div className="mb-4" />
      )}
    </>
  )
}
