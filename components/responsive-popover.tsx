'use client'
import * as React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { PHONE_QUERY, useMediaQuery } from '@/lib/ui/media'
import { cn } from '@/lib/utils'

interface ResponsivePopoverProps {
  /** The trigger element (rendered with `asChild`, so pass a button). */
  trigger: React.ReactElement
  /** Accessible title; shown as the sheet heading on phones. */
  title: string
  children: React.ReactNode
  contentClassName?: string
  /** Stop events inside the content from reaching a card link or drag handle. */
  onContentEvent?: (e: { stopPropagation: () => void }) => void
}

/**
 * Rich popovers become bottom sheets on phones (design rule from the Oct 8
 * audit, F1): a popover anchored to a badge clips above the viewport on a
 * 390px screen, a sheet never does. Desktop keeps the anchored popover,
 * preferring the side below the trigger.
 */
export function ResponsivePopover({ trigger, title, children, contentClassName, onContentEvent }: ResponsivePopoverProps) {
  const phone = useMediaQuery(PHONE_QUERY)
  const stop = onContentEvent
  if (phone) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className={cn('max-h-[85dvh] overflow-y-auto rounded-t-xl p-4 pt-5', contentClassName)}
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={stop}
          data-testid="responsive-sheet"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        avoidCollisions
        aria-label={title}
        className={cn('max-h-[min(32rem,var(--radix-popover-content-available-height))] overflow-y-auto', contentClassName)}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
