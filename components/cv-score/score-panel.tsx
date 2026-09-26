'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, Gauge, Loader2 } from 'lucide-react'
import { DriveConnectButton } from '@/components/drive/drive-connect-button'
import { driveViewUrl } from '@/lib/drive/links'
import { DISPLAY_LOCALE } from '@/lib/ui/date'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AutofixDialog } from './autofix-dialog'
import {
  history as fetchHistory,
  previewFix,
  scoreDocument,
  scoreUpload,
  type AutofixPreview,
  type CvScoreRecord,
  type HistoryPoint,
  type UploadScore,
} from './client'
import { ScoreResults } from './score-results'
import {
  ApplicationSelect,
  DocumentSelect,
  FileDrop,
  SourceToggle,
  type AppOption,
  type CvDocOption,
} from './source-picker'

interface ScorePanelProps {
  documents: CvDocOption[]
  applications: AppOption[]
  initialDocumentId: string
  initialApplicationId: string
}

export function ScorePanel({ documents, applications, initialDocumentId, initialApplicationId }: ScorePanelProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'document' | 'upload'>(documents.length ? 'document' : 'upload')
  const [documentId, setDocumentId] = useState(initialDocumentId)
  const [applicationId, setApplicationId] = useState(initialApplicationId)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(CvScoreRecord & Partial<Pick<UploadScore, 'driveFileId'>>) | null>(null)
  // Off by default: without it an uploaded CV is scored and nothing is stored.
  const [saveToDrive, setSaveToDrive] = useState(false)
  const [driveConnect, setDriveConnect] = useState(false)
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [preview, setPreview] = useState<AutofixPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const canScore = mode === 'document' ? !!documentId : !!file

  async function loadHistory(r: CvScoreRecord): Promise<void> {
    const docId = r.source.documentId ?? null
    const appId = r.target?.applicationId ?? null
    if (!docId && !appId) {
      setPoints([])
      return
    }
    const h = await fetchHistory({ documentId: docId, applicationId: appId })
    setPoints(h.ok ? h.data : [])
  }

  async function runScore(docOverride?: string): Promise<void> {
    setBusy(true)
    const app = applicationId || null
    const res =
      mode === 'upload' && !docOverride
        ? file
          ? await scoreUpload(file, app, saveToDrive)
          : { ok: false as const, error: 'Choose a file first.' }
        : await scoreDocument(docOverride ?? documentId, app)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setResult(res.data)
    const copy = (res.data as Partial<UploadScore>).driveCopy
    if (copy?.saved) toast.success('Saved a copy to Google Drive (Employ/CVs).')
    else if (copy) toast.error(copy.error)
    setDriveConnect(Boolean(copy && !copy.saved && copy.connect))
    void loadHistory(res.data)
  }

  async function onPreviewFix(ids: string[]): Promise<void> {
    setPreviewBusy(true)
    const res = await previewFix(applicationId || null, ids)
    setPreviewBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setPreview(res.data)
  }

  async function onApplied(newDocumentId: string): Promise<void> {
    setPreview(null)
    // Refresh the server-rendered document list, then re-score the NEW
    // master version so the improvement is visible straight away.
    router.refresh()
    setDocumentId(newDocumentId)
    setMode('document')
    await runScore(newDocumentId)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <SourceToggle mode={mode} onMode={setMode} />
          <div className="grid gap-3 md:grid-cols-2">
            {mode === 'document' ? (
              documents.length ? (
                <DocumentSelect id="cv-doc" label="CV" documents={documents} value={documentId} onChange={setDocumentId} />
              ) : (
                <p className="text-sm text-muted-foreground">No CV documents yet — upload a file instead.</p>
              )
            ) : (
              <div className="space-y-2">
                <FileDrop file={file} onFile={setFile} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveToDrive}
                    onChange={(e) => setSaveToDrive(e.target.checked)}
                    data-testid="cv-save-to-drive"
                  />
                  Save a copy to Google Drive
                </label>
                {driveConnect ? <DriveConnectButton returnTo="/cv-score" /> : null}
              </div>
            )}
            <ApplicationSelect id="cv-app" applications={applications} value={applicationId} onChange={setApplicationId} />
          </div>
          <Button onClick={() => void runScore()} disabled={!canScore || busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="animate-spin" /> : <Gauge />}
            {busy ? 'Scoring…' : 'Score CV'}
          </Button>
          {previewBusy ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Preparing fixes…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <ScoreResults
          key={result.id ?? `${result.source.label}-${result.total.score}`}
          result={result}
          history={points}
          onPreviewFix={result.source.kind === 'master_cv' ? (ids) => void onPreviewFix(ids) : undefined}
        />
      ) : null}

      {result?.driveFileId ? (
        <a
          href={driveViewUrl(result.driveFileId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3" /> Open the saved copy in Google Drive
        </a>
      ) : null}

      <SavedCopies points={points} currentId={result?.id ?? null} />

      <AutofixDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onApplied={(applied) => void onApplied(applied.documentId)}
      />
    </div>
  )
}

/** Earlier uploads in this history that kept a copy in Drive. */
function SavedCopies({ points, currentId }: { points: HistoryPoint[]; currentId: string | null }) {
  const saved = points.filter((p) => p.driveFileId && p.id !== currentId)
  if (saved.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Saved CV copies</p>
      <ul className="space-y-0.5">
        {saved.map((p) => (
          <li key={p.id}>
            <a
              href={driveViewUrl(p.driveFileId!)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" />
              {p.sourceLabel || 'CV'} · {new Date(p.createdAt).toLocaleDateString(DISPLAY_LOCALE)} · {p.overall}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
