'use client'
import { toast } from 'sonner'
import { updateJobDetails } from '@/app/(authed)/applications/[id]/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface JobEditFields {
  title: string
  sourceUrl: string
  companyId: string | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  descriptionMd: string | null
  source: string | null
  interestLevel: number | null
}

interface JobEditDialogProps {
  applicationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: JobEditFields
  companies: Array<{ id: string; name: string }>
}

const NONE = '__none__'

const REMOTE = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'unknown', label: 'Unknown' },
]
const EMPLOYMENT = [
  { value: 'fulltime', label: 'Full-time' },
  { value: 'parttime', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'unknown', label: 'Unknown' },
]
const INTEREST = ['1', '2', '3', '4', '5']

/** Radix Select can't hold '' — map the sentinel back before submitting. */
function clearSentinels(fd: FormData): FormData {
  for (const k of ['companyId', 'remoteType', 'employmentType', 'interestLevel']) {
    if (fd.get(k) === NONE) fd.set(k, '')
  }
  return fd
}

export function JobEditDialog({
  applicationId,
  open,
  onOpenChange,
  initial,
  companies,
}: JobEditDialogProps) {
  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await updateJobDetails(applicationId, clearSentinels(fd))
    if ('success' in result) {
      toast.success('Job details saved')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit job details</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-title">Title *</Label>
              <Input id="job-title" name="title" required defaultValue={initial.title} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-url">Job URL *</Label>
              <Input id="job-url" name="sourceUrl" type="url" required defaultValue={initial.sourceUrl} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-company">Company</Label>
              <Select name="companyId" defaultValue={initial.companyId ?? NONE}>
                <SelectTrigger id="job-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>(no company)</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-location">Location</Label>
              <Input id="job-location" name="location" defaultValue={initial.location ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-remote">Remote type</Label>
              <Select name="remoteType" defaultValue={initial.remoteType ?? NONE}>
                <SelectTrigger id="job-remote">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {REMOTE.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-employment">Employment type</Label>
              <Select name="employmentType" defaultValue={initial.employmentType ?? NONE}>
                <SelectTrigger id="job-employment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {EMPLOYMENT.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-salary-min">Salary min</Label>
                <Input
                  id="job-salary-min"
                  name="salaryMin"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={initial.salaryMin ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-salary-max">Salary max</Label>
                <Input
                  id="job-salary-max"
                  name="salaryMax"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={initial.salaryMax ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-currency">Currency</Label>
                <Input
                  id="job-currency"
                  name="salaryCurrency"
                  maxLength={3}
                  placeholder="AED"
                  defaultValue={initial.salaryCurrency ?? ''}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-source">Found via</Label>
              <Input
                id="job-source"
                name="source"
                placeholder="referral, linkedin, discovery…"
                defaultValue={initial.source ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-interest">Interest</Label>
              <Select
                name="interestLevel"
                defaultValue={initial.interestLevel ? String(initial.interestLevel) : NONE}
              >
                <SelectTrigger id="job-interest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {INTEREST.map((v) => (
                    <SelectItem key={v} value={v}>
                      {'★'.repeat(Number(v))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="job-description">Description</Label>
              <Textarea
                id="job-description"
                name="descriptionMd"
                rows={8}
                defaultValue={initial.descriptionMd ?? ''}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
