'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { updateCompany } from '@/app/(authed)/companies/[id]/actions'
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

const SIZES = ['1-10', '11-50', '51-200', '201-1k', '1k-5k', '5k+'] as const
const STAGES = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'public'] as const

export interface CompanyEditFields {
  name: string
  domain: string | null
  website: string | null
  headquartersCity: string | null
  headquartersCountry: string | null
  size: string | null
  stage: string | null
  notesMd: string | null
}

interface CompanyEditDialogProps {
  companyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: CompanyEditFields
}

export function CompanyEditDialog({
  companyId,
  open,
  onOpenChange,
  initial,
}: CompanyEditDialogProps) {
  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await updateCompany(companyId, fd)
    if ('success' in result) {
      toast.success('Company updated')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input id="domain" name="domain" defaultValue={initial.domain ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                placeholder="https://…"
                defaultValue={initial.website ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="headquartersCity">HQ city</Label>
              <Input
                id="headquartersCity"
                name="headquartersCity"
                defaultValue={initial.headquartersCity ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="headquartersCountry">Country (ISO-2)</Label>
              <Input
                id="headquartersCountry"
                name="headquartersCountry"
                maxLength={2}
                defaultValue={initial.headquartersCountry ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="size">Size</Label>
              <Select name="size" defaultValue={initial.size ?? undefined}>
                <SelectTrigger id="size">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage">Stage</Label>
              <Select name="stage" defaultValue={initial.stage ?? undefined}>
                <SelectTrigger id="stage">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="notesMd">Notes</Label>
              <Textarea
                id="notesMd"
                name="notesMd"
                rows={4}
                defaultValue={initial.notesMd ?? ''}
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
