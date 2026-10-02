'use client'
import { Upload } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

export interface CvDocOption {
  id: string
  title: string
  kind: 'master_cv' | 'tailored_cv' | 'latex_cv'
  applicationId: string | null
}

export interface AppOption {
  id: string
  title: string
  company: string | null
  status: string
}

const KIND_LABEL: Record<CvDocOption['kind'], string> = {
  master_cv: 'Master',
  tailored_cv: 'Tailored',
  latex_cv: 'LaTeX',
}

export function DocumentSelect({
  id,
  label,
  documents,
  value,
  onChange,
}: {
  id: string
  label: string
  documents: CvDocOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a CV…</option>
        {documents.map((d) => (
          <option key={d.id} value={d.id}>
            [{KIND_LABEL[d.kind]}] {d.title}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

export function ApplicationSelect({
  id,
  applications,
  value,
  onChange,
  allowNone = true,
}: {
  id: string
  applications: AppOption[]
  value: string
  onChange: (v: string) => void
  allowNone?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Target job</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone ? <option value="">No job — general CV quality</option> : <option value="">Select a job…</option>}
        {applications.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
            {a.company ? ` · ${a.company}` : ''} ({a.status})
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

export function SourceToggle({
  mode,
  onMode,
}: {
  mode: 'document' | 'upload'
  onMode: (m: 'document' | 'upload') => void
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-sm" role="radiogroup" aria-label="CV source">
      {(['document', 'upload'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onMode(m)}
          className={cn(
            'rounded px-3 py-1 transition-colors',
            mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {m === 'document' ? 'Saved CV' : 'Upload a file'}
        </button>
      ))}
    </div>
  )
}

export function FileDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm hover:bg-accent/40">
      <Upload className="size-5 text-muted-foreground" />
      <span>{file ? file.name : 'Choose a PDF, DOCX, TXT or MD (max 5 MB)'}</span>
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.docx,.txt,.md"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}
