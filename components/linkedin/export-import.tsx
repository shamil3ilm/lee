'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ImportReviewPanel } from '@/components/import/import-review-panel'
import { applyLinkedInImportAction, importConnectionsChunkAction } from '@/app/(authed)/settings/linkedin/actions'
import type { ImportApplyResult } from '@/lib/import/result'
import type { ReviewSection, ReviewSelection } from '@/lib/import/types'
import type { LinkedInExport } from '@/lib/integrations/linkedin/export/parse'
import { buildImportItems } from '@/lib/integrations/linkedin/review'
import type { ResumeProfile } from '@/lib/resume/types'

const LABELS: Partial<Record<ReviewSection, string>> = { work: 'Positions' }

const CHUNK = 2000

interface ExportImportProps {
  profile: ResumeProfile
  /** lee may add public facts for this user (canEditPublicFacts, lib/portfolio/lock.ts). */
  editable: boolean
}

/**
 * Upload LinkedIn's data export ZIP: it is read in this browser (only the
 * CSVs lee uses are unzipped), then every item is reviewed with the shared
 * import review. Nothing is saved until Apply.
 */
export function ExportImport({ profile, editable }: ExportImportProps) {
  const router = useRouter()
  const [data, setData] = useState<LinkedInExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withConnections, setWithConnections] = useState(true)
  const [withEmails, setWithEmails] = useState(false)

  const items = useMemo(() => (data ? buildImportItems(profile, data) : []), [data, profile])
  const hasEmails = data?.connections.some((c) => c.email) ?? false

  const onFile = async (file: File | undefined): Promise<void> => {
    setError(null)
    setData(null)
    if (!file) return
    try {
      const { readLinkedInExportZip } = await import('@/lib/integrations/linkedin/export/unzip')
      setData(await readLinkedInExportZip(new Uint8Array(await file.arrayBuffer())))
    } catch (e) {
      setError(e instanceof Error && e.name === 'ExportZipError' ? e.message : 'Could not read that file.')
    }
  }

  const apply = async (selection: ReviewSelection): Promise<ImportApplyResult> => {
    if (!data) return { ok: false, error: 'Choose the export first.' }
    const { connections, ...rest } = data
    const r = await applyLinkedInImportAction(rest, selection)
    if (!r.ok) return r
    if (withConnections && connections.length > 0) {
      let saved = 0
      for (let i = 0; i < connections.length; i += CHUNK) {
        const c = await importConnectionsChunkAction(connections.slice(i, i + CHUNK), withEmails, r.batchId)
        if (!c.ok) {
          toast.error(c.error)
          break
        }
        saved += c.saved
      }
      if (saved > 0) toast.success(`Saved ${saved.toLocaleString('en-US')} connections.`)
    }
    return r
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        On LinkedIn: Me › Settings &amp; Privacy › Data privacy › Get a copy of your data. Pick the larger archive (or Connections,
        Positions, Profile, Education and Skills), download the ZIP when LinkedIn emails you, and choose it here. It is read in your browser;
        only the parts listed below are sent to lee.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent">
        <Upload className="size-4" aria-hidden="true" />
        <span>Choose the LinkedIn export ZIP</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          data-testid="linkedin-export-input"
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {data ? (
        <div data-testid="linkedin-import-review">
          <ImportReviewPanel
            key={data.found.join(',')}
            items={items}
            suggestOnly={!editable}
            labels={LABELS}
            allowEmpty={withConnections && data.connections.length > 0}
            intro={
              <p className="text-xs text-muted-foreground">
                Found: {data.found.join(', ') || 'nothing lee reads'}. New items are ticked; items already in lee are not, and are never added
                twice. New skills, projects and bullet highlights are <strong>not interview-ready</strong> unless you mark them “Mine”.
              </p>
            }
            onApply={apply}
            onCancel={() => setData(null)}
            onApplied={() => router.refresh()}
            onDone={() => setData(null)}
          >
            {data.connections.length > 0 ? (
              <div className="space-y-1.5 rounded-md border p-3">
                <Checkbox
                  checked={withConnections}
                  onChange={(e) => setWithConnections(e.currentTarget.checked)}
                  label={`Save ${data.connections.length.toLocaleString('en-US')} connections for referral hints`}
                  description="Name, company, position and the date you connected. Private to you; delete them any time."
                />
                {hasEmails ? (
                  <Checkbox
                    checked={withEmails}
                    disabled={!withConnections}
                    onChange={(e) => setWithEmails(e.currentTarget.checked)}
                    label="Also keep their email addresses (where the export has them)"
                  />
                ) : null}
              </div>
            ) : null}
          </ImportReviewPanel>
        </div>
      ) : null}
    </div>
  )
}
