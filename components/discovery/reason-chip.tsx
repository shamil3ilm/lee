import { Filter, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { reasonChip, type ReasonInput } from '@/lib/ui/reason-chip'

/**
 * The one reason chip on a job card or row ("Uncertain fit — review",
 * "Needs a look", "Language: Arabic required"). Renders nothing when
 * there is no reason to show.
 */
export function ReasonChip({ className, ...input }: ReasonInput & { className?: string }) {
  const chip = reasonChip(input)
  if (!chip) return null
  const Icon = input.status === 'filtered' ? Filter : Info
  return (
    <Badge
      variant={chip.tone === 'warning' ? 'warning' : 'outline'}
      title={chip.title}
      data-testid="reason-chip"
      className={cn('max-w-full gap-1 font-normal', className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{chip.label}</span>
    </Badge>
  )
}
