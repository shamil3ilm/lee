'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { applyLinkedInImportAction, importConnectionsChunkAction } from '@/app/(authed)/settings/linkedin/actions'
import type { LinkedInExport } from '@/lib/integrations/linkedin/export/parse'
import { buildImportSuggestions, type ImportSection } from '@/lib/integrations/linkedin/review'
import type { ResumeProfile } from '@/lib/resume/types'

const SECTION_LABELS: Readonly<Record<ImportSection, string>> = {
  work: 'Positions',
  education: 'Education',
  skills: 'Skills',
  certificates: 'Certifications',
  projects: 'Projects',
  languages: 'Languages',
}

const CHUNK = 2000

interface ExportImportProps {
  profile: ResumeProfile
}

/**
 * Upload LinkedIn's data export ZIP: it is read in this browser (only the
 * CSVs lee uses are unzipped), then every item is a suggestion to review.
 * Nothing is saved until "Add selected".
 */
export function ExportImport({ profile }: ExportImportProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [data, setData] = useState<LinkedInExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [own, setOwn] = useState<Set<string>>(new Set())
  const [withConnections, setWithConnections] = useState(true)
  const [withEmails, setWithEmails] = useState(false)

  const suggestions = useMemo(() => (data ? buildImportSuggestions(profile, data) : []), [data, profile])
  const hasEmails = data?.connections.some((c) => c.email) ?? false

  const onFile = async (file: File | undefined): Promise<void> => {
    setError(null)
    setData(null)
    if (!file) return
    try {
      const { readLinkedInExportZip } = await import('@/lib/integrations/linkedin/export/unzip')
      const parsed = await readLinkedInExportZip(new Uint8Array(await file.arrayBuffer()))
      setData(parsed)
      const fresh = buildImportSuggestions(profile, parsed).filter((s) => s.status === 'new')
      setPicked(new Set(fresh.map((s) => s.key)))
      setOwn(new Set())
    } catch (e) {
      setError(e instanceof Error && e.name === 'ExportZipError' ? e.message : 'Could not read that file.')
    }
  }

  const toggle = (set: Set<string>, key: string, on: boolean): Set<string> => {
    const next = new Set(set)
    if (on) next.add(key)
    else next.delete(key)
    return next
  }

  const apply = (): void => {
    if (!data) return
    start(async () => {
      const { connections, ...rest } = data
      const r = await applyLinkedInImportAction(rest, { keys: [...picked], own: [...own] })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      let saved = 0
      if (withConnections && connections.length > 0) {
        for (let i = 0; i < connections.length; i += CHUNK) {
          const c = await importConnectionsChunkAction(connections.slice(i, i + CHUNK), withEmails)
          if (!c.ok) {
            toast.error(c.error)
            break
          }
          saved += c.saved
        }
      }
      toast.success(`Added ${r.added} item${r.added === 1 ? '' : 's'} to your profile${saved > 0 ? `; saved ${saved.toLocaleString('en-US')} connections` : ''}.`)
      setData(null)
      router.refresh()
    })
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
        <div className="space-y-4" data-testid="linkedin-import-review">
          <p className="text-xs text-muted-foreground">
            Found: {data.found.join(', ') || 'nothing lee reads'}. New items are ticked; items already in your profile are never added twice.
            New skills, projects and bullet highlights are <strong>not interview-ready</strong> unless you tick “Mine”.
          </p>
          {(Object.keys(SECTION_LABELS) as ImportSection[]).map((section) => {
            const rows = suggestions.filter((s) => s.section === section)
            if (rows.length === 0) return null
            return (
              <fieldset key={section} className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{SECTION_LABELS[section]}</legend>
                <ul className="space-y-1.5">
                  {rows.map((s) => (
                    <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Checkbox
                        checked={picked.has(s.key)}
                        disabled={s.status === 'duplicate' || pending}
                        onChange={(e) => setPicked((cur) => toggle(cur, s.key, e.currentTarget.checked))}
                        label={
                          <span>
                            {s.label}
                            {s.detail ? <span className="text-muted-foreground"> · {s.detail}</span> : null}
                          </span>
                        }
                      />
                      {s.status === 'duplicate' ? <Badge variant="neutral" className="text-[10px]">Already in your profile</Badge> : null}
                      {s.status === 'new' && s.hasReadiness ? (
                        <Checkbox
                          checked={own.has(s.key)}
                          disabled={!picked.has(s.key) || pending}
                          onChange={(e) => setOwn((cur) => toggle(cur, s.key, e.currentTarget.checked))}
                          label={<span className="text-xs">Mine (interview-ready)</span>}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </fieldset>
            )
          })}
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
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={apply} data-testid="linkedin-import-apply">
              Add selected
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setData(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
