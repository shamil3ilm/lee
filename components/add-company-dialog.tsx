'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { addCompany } from '@/app/(authed)/companies/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SIZES = ['1-10', '11-50', '51-200', '201-1k', '1k-5k', '5k+'] as const
const STAGES = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'public'] as const

export function AddCompanyDialog() {
  const [open, setOpen] = useState(false)

  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await addCompany(fd)
    if ('success' in result) {
      toast.success('Company added')
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add company
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add company to watchlist</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required autoFocus />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="domain">Domain *</Label>
              <Input id="domain" name="domain" placeholder="stripe.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="headquartersCountry">Country (ISO-2)</Label>
              <Input
                id="headquartersCountry"
                name="headquartersCountry"
                placeholder="AE"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="size">Size</Label>
              <Select name="size">
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
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="stage">Funding stage</Label>
              <Select name="stage">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
