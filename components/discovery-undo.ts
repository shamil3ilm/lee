'use client'
import { toast } from 'sonner'
import { restoreCompanyDiscovery, restoreDiscoveries } from '@/app/(authed)/discoveries/actions'

/** Success toast for a job-discovery dismiss, with an Undo that restores them. */
export function toastDismissedJobs(message: string, ids: string[]): void {
  toast.success(message, {
    action: {
      label: 'Undo',
      onClick: () => {
        void restoreDiscoveries(ids).then((r) => {
          if ('success' in r) toast.success(r.count === 1 ? 'Restored' : `Restored ${r.count}`)
          else toast.error(r.error)
        })
      },
    },
  })
}

/** Success toast for a company-discovery dismiss, with Undo. */
export function toastDismissedCompany(id: string): void {
  toast.success('Dismissed', {
    action: {
      label: 'Undo',
      onClick: () => {
        void restoreCompanyDiscovery(id).then((r) => {
          if ('success' in r) toast.success('Restored')
          else if ('error' in r) toast.error(r.error)
        })
      },
    },
  })
}
