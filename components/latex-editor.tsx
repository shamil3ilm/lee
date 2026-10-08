'use client'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { LatexAssetsDialog } from '@/components/latex-assets-dialog'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { extractLatexHint, isMainFile, parseLatexLog } from '@/lib/latex/errors'
import { extractOutline } from '@/lib/latex/outline'
import { applyToolbarCommand } from '@/lib/latex/editor-commands'
import { DEFAULT_COMPILE_SETTINGS, type CompileSettings } from '@/lib/latex/compile-settings'
import { IMPORT_ACCEPT, MAIN_FILE } from '@/lib/latex/file-kinds'
import { packageLine } from '@/lib/latex/missing'
import { looksLikeFilePath, pathFileName } from '@/lib/latex/path-paste'
import { stepFontSize, type SidePanel } from '@/lib/latex/editor-prefs'
import type { CodeEditorHandle } from '@/components/latex/code-editor'
import type { CompileDiagnostic } from '@/components/latex/cm-setup'
import { ProblemsPanel } from '@/components/latex/problems-panel'
import { useBibSources } from '@/components/latex/use-bib-sources'
import { useLatexCompile, type CompileError, type CompileSnapshot } from '@/components/latex/use-latex-compile'
import { TopBar } from '@/components/latex/workspace/top-bar'
import { SideRail } from '@/components/latex/workspace/side-rail'
import { FilesPanel } from '@/components/latex/workspace/files-panel'
import { SearchPanel } from '@/components/latex/workspace/search-panel'
import { FileTabs } from '@/components/latex/workspace/file-tabs'
import { EditorToolbar } from '@/components/latex/workspace/editor-toolbar'
import { PdfPane } from '@/components/latex/workspace/pdf-pane'
import { PathBanner } from '@/components/latex/workspace/path-banner'
import { ImportTexDialog } from '@/components/latex/workspace/import-dialog'
import { WorkspaceLayout } from '@/components/latex/workspace/workspace-layout'
import { useEditorPrefs } from '@/components/latex/workspace/use-editor-prefs'
import { useWorkspaceSize } from '@/components/latex/workspace/use-workspace-size'
import { useAutosave } from '@/components/latex/workspace/use-autosave'
import { useProjectFiles } from '@/components/latex/workspace/use-project-files'
import { useImport } from '@/components/latex/workspace/use-import'
import { useZipPicker, ZipImportHost, ZipInput } from '@/components/latex/project-import/zip-import-host'
import type { EditorImportResult } from '@/components/latex/project-import/zip-import-dialog'
import { ImportReport } from '@/components/latex/project-import/import-report'
import { takeImportReport, type ImportReportItem } from '@/components/latex/project-import/report-store'
import { downloadProjectZip } from '@/components/latex/project-import/export-zip'
import { isZipFile } from '@/lib/latex/project/file-types'

// CodeMirror 6 is bundled (no CDN) into its own chunk that only this route
// loads, after hydration. Until it arrives a plain textarea is editable, so
// slow phones can start typing at once. If the chunk cannot load (offline,
// blocked), the textarea simply stays: the editor degrades, never breaks.
const CodeEditor = dynamic(
  () => import('@/components/latex/code-editor').catch(() => ({ default: () => null })),
  { ssr: false, loading: () => null },
)

interface LatexEditorProps {
  documentId: string
  initialTitle: string
  initialSource: string
  initialError: CompileError | null
  initialAssets: AssetMetadata[]
  /** Saved compile service + engine (defaults: auto fallback, pdfLaTeX). */
  initialSettings?: CompileSettings
  /** The source's path in an imported project (export puts it back there). */
  initialMainFile?: string | null
  /** Compile once on open (right after a project import). */
  compileOnOpen?: boolean
  className?: string
}

interface Banner {
  fileName: string | null
  pasted: string | null
}

/**
 * The LaTeX workspace, laid out like Overleaf: a top bar (title, save state,
 * layout), a rail with Files + outline and Search, file tabs and a
 * formatting toolbar over the code, and the PDF column with its own
 * pdf.js viewer, the Recompile menu and the logs.
 */
export function LatexEditor({
  documentId,
  initialTitle,
  initialSource,
  initialError,
  initialAssets,
  initialSettings = DEFAULT_COMPILE_SETTINGS,
  initialMainFile = null,
  compileOnOpen = false,
  className,
}: LatexEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<CodeEditorHandle | null>(null)
  const [source, setSource] = useState(initialSource)
  const [title, setTitle] = useState(initialTitle)
  const [settings, setSettings] = useState<CompileSettings>(initialSettings)
  const [editorReady, setEditorReady] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [narrowPane, setNarrowPane] = useState<'editor' | 'pdf'>('editor')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [overlayPanel, setOverlayPanel] = useState<SidePanel>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [mainFile, setMainFile] = useState<string | null>(initialMainFile)
  const [report, setReport] = useState<ImportReportItem[]>([])
  const zip = useZipPicker()
  // Compile once the state an import (or opening after one) set has settled.
  const compileSoon = useRef(compileOnOpen)
  // Phones: after a compile pressed in the Editor view, show the PDF.
  const showPdfAfterCompile = useRef(false)
  const [prefs, setPrefs] = useEditorPrefs()
  const size = useWorkspaceSize(rootRef)
  const files = useProjectFiles(documentId, initialAssets)
  const autosave = useAutosave(documentId, source, title)
  const bibSources = useBibSources(documentId, files.assets)

  const beforeCompile = useCallback(
    async (snapshot: CompileSnapshot): Promise<boolean> => {
      if (looksLikeFilePath(snapshot.source)) {
        setBanner({ fileName: pathFileName(snapshot.source), pasted: null })
        return false
      }
      await files.flushTexts()
      return true
    },
    [files],
  )
  const compile = useLatexCompile({ documentId, initialError, beforeCompile })
  const { notifyChange, compileNow } = compile

  const assetKey = useMemo(() => files.assets.map((a) => `${a.id}:${a.filename}:${a.sizeBytes}`).join('|'), [files.assets])
  const snapshot = useMemo<CompileSnapshot>(
    () => ({ source, draft: prefs.fastMode, assetKey, settings }),
    [source, prefs.fastMode, assetKey, settings],
  )
  const snapshotRef = useRef(snapshot)
  const initialKey = useRef<string | null>(null)
  const edited = useRef(false)
  useEffect(() => {
    snapshotRef.current = snapshot
    // The saved source is already compiled (the preview loads it). Until the
    // source or the files change, nothing auto-compiles: the per-viewer
    // preferences arriving after hydration are not an edit.
    const key = `${snapshot.assetKey}\0${snapshot.source}`
    initialKey.current ??= key
    if (!edited.current && key === initialKey.current) return
    edited.current = true
    notifyChange(snapshot)
  }, [snapshot, notifyChange])

  const compileCurrent = useCallback(() => compileNow(snapshotRef.current), [compileNow])
  const saveAndCompile = useCallback(() => {
    void autosave.saveNow()
    showPdfAfterCompile.current = true
    compileCurrent()
  }, [autosave, compileCurrent])

  useEffect(() => {
    if (!compileSoon.current) return
    // Cleared only when it runs: Strict Mode's effect replay must not drop it.
    const t = setTimeout(() => {
      compileSoon.current = false
      compileNow(snapshotRef.current)
    }, 50)
    return () => clearTimeout(t)
  }, [snapshot, compileNow])

  // A report handed over by an import from the Documents page; drop the
  // one-time ?compile=1 from the address bar.
  useEffect(() => {
    const t = setTimeout(() => {
      const items = takeImportReport(documentId)
      if (items.length > 0) setReport(items)
      if (compileOnOpen) window.history.replaceState(null, '', window.location.pathname)
    }, 0)
    return () => clearTimeout(t)
  }, [documentId, compileOnOpen])

  // Ctrl/Cmd+Enter and Ctrl/Cmd+S compile (and save) from anywhere on the
  // page. Inside CodeMirror its own keymap handles them first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key === 'Enter' || e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveAndCompile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveAndCompile])

  // A text asset opens in the editor once its text has loaded (until then
  // the editor stays on main.tex), so its editor state never starts empty.
  const editorFile =
    files.active === MAIN_FILE || files.texts[files.active]?.loading !== false ? MAIN_FILE : files.active
  const activeText = editorFile === MAIN_FILE ? source : (files.texts[editorFile]?.value ?? '')
  const insertSnippet = useCallback((snippet: string, pos: number | null = null) => {
    const editor = editorRef.current
    if (editor) editor.insertText(`${snippet}\n`, pos)
    else setSource((s) => (s.endsWith('\n') ? `${s}${snippet}\n` : `${s}\n${snippet}\n`))
  }, [])
  const replaceMain = useCallback(
    (text: string) => {
      setBanner(null)
      if (editorFile === MAIN_FILE && editorRef.current) {
        editorRef.current.replaceAll(text)
        return
      }
      // Switch to main.tex first; its editor state (with undo) takes the text.
      files.setActive(MAIN_FILE)
      setTimeout(() => {
        if (editorRef.current) editorRef.current.replaceAll(text)
        else setSource(text)
      }, 50)
    },
    [files, editorFile],
  )
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const importer = useImport({ files, inputRef: importInputRef, replaceMain, insertSnippet })

  const narrowNow = size === 'narrow'
  useEffect(() => {
    if (compile.compiling || !showPdfAfterCompile.current) return
    showPdfAfterCompile.current = false
    if (!narrowNow || compile.error || !compile.pdfUrl) return
    const t = setTimeout(() => setNarrowPane('pdf'), 0)
    return () => clearTimeout(t)
  }, [compile.compiling, compile.error, compile.pdfUrl, narrowNow])

  const importAny = useCallback(
    (list: FileList | readonly File[], pos: number | null = null) => {
      const all = Array.from(list)
      const rest = all.filter((f) => !isZipFile(f))
      if (rest.length < all.length) zip.takeDropped(all)
      if (rest.length > 0) void importer.importFiles(rest, pos)
    },
    [importer, zip],
  )

  const onImported = useCallback(
    (result: EditorImportResult) => {
      files.forget(result.removed)
      if (result.created.length > 0) files.setAssets((a) => [...a, ...result.created])
      if (result.source !== null) {
        replaceMain(result.source)
        setMainFile(result.mainFile)
      }
      const { engine, service } = result
      if (engine) setSettings((s) => ({ ...s, engine, ...(service ? { service } : {}) }))
      setReport(result.report)
      compileSoon.current = true
    },
    [files, replaceMain],
  )

  // Stable while the file list is, so the review is not re-planned on every keystroke.
  const zipTarget = useMemo(() => ({ kind: 'editor' as const, documentId, assets: files.assets }), [documentId, files.assets])

  async function downloadZip(): Promise<void> {
    try {
      await files.flushTexts()
      await downloadProjectZip({ documentId, title, source, mainFile, assets: files.assets })
    } catch {
      toast.error('Could not build the project zip. Try again.')
    }
  }

  const jumpToLine = useCallback(
    (line: number, file: string = MAIN_FILE) => {
      setNarrowPane('editor')
      setOverlayPanel(null)
      compile.setProblemsOpen(false)
      if (file !== files.active) {
        void files.open(file)
        setTimeout(() => editorRef.current?.jumpTo(line), 50)
        return
      }
      editorRef.current?.jumpTo(line)
    },
    [compile, files],
  )

  const onChange = useCallback(
    (fileId: string, value: string) => {
      if (fileId === MAIN_FILE) setSource(value)
      else files.setText(fileId, value)
    },
    [files],
  )
  const onPathPaste = useCallback((text: string) => {
    if (!looksLikeFilePath(text)) return false
    setBanner({ fileName: pathFileName(text), pasted: text })
    return true
  }, [])
  const onDropFiles = useCallback((list: FileList, pos: number | null) => importAny(list, pos), [importAny])
  const onEditorReady = useCallback(() => setEditorReady(true), [])

  const parsedLog = useMemo(() => (compile.error ? parseLatexLog(compile.error.log) : null), [compile.error])
  const deferredSource = useDeferredValue(source)
  const hint = useMemo(
    () => (compile.error ? extractLatexHint(compile.error.log, deferredSource) : null),
    [compile.error, deferredSource],
  )
  const hintLine = hint?.kind === 'missing_package' && hint.subject ? packageLine(deferredSource, hint.subject) : null
  const compileDiagnostics = useMemo<CompileDiagnostic[]>(
    () =>
      editorFile !== MAIN_FILE
        ? []
        : (parsedLog?.all ?? [])
            .filter((e) => e.line !== null && isMainFile(e.file))
            .map((e) => ({
              line: e.line!,
              severity: e.severity === 'error' ? 'error' : e.severity === 'warning' ? 'warning' : 'info',
              message: e.message,
            })),
    [parsedLog, editorFile],
  )
  const completionData = useMemo(
    () => ({ bibSources, assetFilenames: files.assets.map((a) => a.filename) }),
    [bibSources, files.assets],
  )
  const deferredActive = useDeferredValue(activeText)
  const outline = useMemo(() => extractOutline(deferredActive), [deferredActive])
  const searchFiles = useMemo(
    () => [
      { name: MAIN_FILE, text: source },
      ...Object.entries(files.texts).map(([name, t]) => ({ name, text: t.value })),
    ],
    [source, files.texts],
  )

  // Say once (per distinct message) when a fallback or stand-in produced the PDF.
  const lastNotes = useRef('')
  useEffect(() => {
    const text = compile.outcome.notes.join(' ')
    if (text && text !== lastNotes.current) toast.info(text)
    lastNotes.current = text
  }, [compile.outcome])

  function downloadTex(): void {
    const blob = new Blob([source], { type: 'application/x-tex' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9\-_. ]/gi, '_') || 'document'}.tex`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const narrow = size === 'narrow'
  // Wide: the remembered side panel sits inline. Narrower: it overlays the
  // editor only while opened from the rail.
  const sidePanel = size === 'wide' ? prefs.sidePanel : overlayPanel
  const setSidePanel = (next: SidePanel) => (size === 'wide' ? setPrefs({ sidePanel: next }) : setOverlayPanel(next))
  const panel =
    sidePanel === 'files' ? (
      <FilesPanel
        assets={files.assets}
        active={files.active}
        busy={files.busy}
        outline={outline}
        onOpen={(f) => void files.open(f)}
        onDelete={setPendingDelete}
        onCreate={files.create}
        onUpload={importer.openPicker}
        onImportZip={zip.open}
        onDropFiles={(list) => importAny(list)}
        onJump={(line) => jumpToLine(line, files.active)}
      />
    ) : sidePanel === 'search' ? (
      <SearchPanel files={searchFiles} onOpen={(file, line) => jumpToLine(line, file)} />
    ) : null

  const editorColumn = (
    <section aria-label="Source" className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <FileTabs
        tabs={files.tabs}
        active={files.active}
        dirty={[...files.dirtyTexts, ...(autosave.state === 'unsaved' ? [MAIN_FILE] : [])]}
        onSelect={files.setActive}
        onClose={files.close}
      />
      <EditorToolbar
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        onCommand={(c) => editorRef.current?.edit((doc, from, to) => applyToolbarCommand(c, doc, from, to))}
        onSymbol={(latex) => editorRef.current?.insertText(latex)}
        onFind={() => editorRef.current?.openSearch()}
        fontSize={prefs.fontSize}
        onFontSize={(d) => setPrefs({ fontSize: stepFontSize(prefs.fontSize, d) })}
      />
      <ImportReport items={report} onJump={(file, line) => jumpToLine(line, file)} onDismiss={() => setReport([])} />
      {banner ? (
        <PathBanner
          fileName={banner.fileName}
          fromPaste={banner.pasted !== null}
          onImport={() => {
            setBanner(null)
            importer.openPicker()
          }}
          onPasteAnyway={() => {
            if (banner.pasted) editorRef.current?.insertText(banner.pasted)
            setBanner(null)
          }}
          onDismiss={() => setBanner(null)}
        />
      ) : null}
      <div className="relative min-h-0 flex-1">
        {!editorReady ? (
          <textarea
            value={activeText}
            onChange={(e) => onChange(editorFile, e.target.value)}
            aria-label="LaTeX source"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="absolute inset-0 z-10 h-full w-full resize-none bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
          />
        ) : null}
        <CodeEditor
          fileId={editorFile}
          initialValue={activeText}
          fontSize={prefs.fontSize}
          handleRef={editorRef}
          onChange={onChange}
          onCompile={saveAndCompile}
          onDropFiles={onDropFiles}
          onDragActive={setDragActive}
          onPathPaste={onPathPaste}
          completionData={completionData}
          compileDiagnostics={compileDiagnostics}
          onReady={onEditorReady}
        />
        {dragActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 ring-2 ring-inset ring-primary backdrop-blur-sm">
            <p className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium shadow">Drop files to add them</p>
          </div>
        ) : null}
      </div>
    </section>
  )

  const logs =
    compile.error && parsedLog ? (
      <ProblemsPanel
        className="h-full"
        title={compile.error.message}
        parsed={parsedLog}
        rawLog={compile.error.log}
        hint={hint}
        notes={compile.error.notes}
        hintLine={hintLine}
        onUseFallback={settings.service === 'auto' ? undefined : () => setSettings((s) => ({ ...s, service: 'auto' }))}
        onImport={importer.openPicker}
        onJump={(line) => jumpToLine(line)}
        onClose={() => compile.setProblemsOpen(false)}
      />
    ) : (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No problems in the last compile.{' '}
        <button type="button" className="ml-1 underline" onClick={() => compile.setProblemsOpen(false)}>
          Back to the PDF
        </button>
      </div>
    )

  const compileMenu = {
    compiling: compile.compiling,
    autoCompile: compile.autoCompile,
    onAutoCompile: compile.setAutoCompile,
    fastMode: prefs.fastMode,
    onFastMode: (on: boolean) => setPrefs({ fastMode: on }),
    settings,
    onSettings: setSettings,
    onCompile: saveAndCompile,
    onClearCache: () => compileNow(snapshotRef.current, { fresh: true }),
  }

  const pdfColumn = (
    <PdfPane
      compile={compileMenu}
      previewState={compile.previewState}
      pdfBytes={compile.pdfBytes}
      pdfUrl={compile.pdfUrl}
      pdfIsDraft={compile.pdfIsDraft}
      service={compile.outcome.service}
      serviceNote={compile.outcome.notes.join(' ')}
      lastCompile={compile.lastCompile}
      downloadName={`${title.replace(/[^a-z0-9\-_. ]/gi, '_') || 'document'}.pdf`}
      logsOpen={compile.problemsOpen}
      logs={logs}
      dark={prefs.darkPdf}
      onDark={(on) => setPrefs({ darkPdf: on })}
    />
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={rootRef}
        className={cn('@container/editor flex h-[calc(100dvh-3.5rem)] min-h-[480px] flex-col overflow-hidden bg-background', className)}
      >
        <TopBar
          title={title}
          onTitle={setTitle}
          saveState={autosave.state}
          onSave={() => void autosave.saveNow()}
          layout={narrow ? narrowPane : prefs.layout}
          onLayout={(l) => (narrow ? setNarrowPane(l === 'pdf' ? 'pdf' : 'editor') : setPrefs({ layout: l }))}
          onSwap={() => setPrefs({ order: prefs.order === 'editor-first' ? 'pdf-first' : 'editor-first' })}
          narrow={narrow}
          pdfUrl={compile.pdfUrl}
          onImport={importer.openPicker}
          onDownloadTex={downloadTex}
          onImportZip={zip.open}
          onDownloadZip={() => void downloadZip()}
          compile={compileMenu}
          errors={parsedLog?.errors.length ?? (compile.error ? 1 : 0)}
          warnings={parsedLog?.warnings.length ?? 0}
          logsOpen={compile.problemsOpen}
          onLogs={(open) => {
            compile.setProblemsOpen(open)
            // The logs show in the PDF column; on phones, switch to it.
            if (open && narrow) setNarrowPane('pdf')
          }}
        />
        <WorkspaceLayout
          size={size}
          prefs={prefs}
          onPrefs={setPrefs}
          narrowPane={narrowPane}
          rail={
            <SideRail
              panel={sidePanel}
              onPanel={setSidePanel}
              onAssets={() => setAssetsOpen(true)}
              assetCount={files.assets.length}
            />
          }
          panel={panel}
          onClosePanel={() => setSidePanel(null)}
          editor={editorColumn}
          pdf={pdfColumn}
        />
        <input
          ref={importInputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="import-input"
          onChange={(e) => {
            if (e.target.files) importAny(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
        <ImportTexDialog {...importer.dialog} />
        <ZipInput inputRef={zip.inputRef} onChange={zip.onInputChange} />
        <ZipImportHost
          file={zip.file}
          target={zipTarget}
          onClose={() => zip.setFile(null)}
          onImported={onImported}
        />
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete ${pendingDelete ?? ''}?`}
          description="The file is removed from this document. A \includegraphics or \input that names it will stop compiling."
          onConfirm={() => {
            if (pendingDelete) void files.remove(pendingDelete)
            setPendingDelete(null)
          }}
        />
        <LatexAssetsDialog
          documentId={documentId}
          assets={files.assets}
          onAssetsChange={files.setAssets}
          onInsertSnippet={(s) => insertSnippet(s)}
          open={assetsOpen}
          onOpenChange={setAssetsOpen}
        />
      </div>
    </TooltipProvider>
  )
}

