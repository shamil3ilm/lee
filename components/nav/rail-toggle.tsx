'use client'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RailToggleProps {
  rail: boolean
  onToggle: () => void
}

export function RailToggle({ rail, onToggle }: RailToggleProps) {
  const label = rail ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={rail}
      title={label}
    >
      {/* Icon follows the CSS attribute (set pre-paint) so it never flashes. */}
      <PanelLeftClose className="group-data-[sidebar=rail]/shell:hidden" />
      <PanelLeftOpen className="hidden group-data-[sidebar=rail]/shell:block" />
    </Button>
  )
}
