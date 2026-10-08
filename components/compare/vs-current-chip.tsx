import Link from 'next/link'
import { Scale } from 'lucide-react'
import { cn } from '@/lib/utils'

/** "vs current: pay ↑ 35% est. · growth ↑ · benefits ?" linking to the full comparison. */
export function VsCurrentChip({ text, href, className }: { text: string; href: string; className?: string }) {
  return (
    <Link
      href={href}
      data-testid="vs-current-chip"
      title="Compared with your current job (estimates; ? = unknown)"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <Scale className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </Link>
  )
}
