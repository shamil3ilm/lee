'use client'
import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Slot } from '@radix-ui/react-slot'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { PHONE_QUERY } from '@/lib/ui/media'
import { cn } from '@/lib/utils'

interface ResponsivePopoverProps {
  /** The trigger element (a button); it is rendered once and never swapped. */
  trigger: React.ReactElement
  /** Accessible title; shown as the sheet heading on phones. */
  title: string
  children: React.ReactNode
  contentClassName?: string
  /** Stop events inside the content from reaching a card link or drag handle. */
  onContentEvent?: (e: { stopPropagation: () => void }) => void
}

type Mode = 'closed' | 'popover' | 'sheet'

function isPhone(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches
}

/**
 * Rich popovers become bottom sheets on phones (design rule from the Oct 8
 * audit, F1): a popover anchored to a badge clips above the viewport on a
 * 390px screen, a sheet never does. The trigger is one stable element; the
 * popover-or-sheet choice is made when it opens, so hydration never swaps
 * the trigger out from under a tap.
 */
export function ResponsivePopover({ trigger, title, children, contentClassName, onContentEvent }: ResponsivePopoverProps) {
  const [mode, setMode] = React.useState<Mode>('closed')
  const triggerRef = React.useRef<HTMLElement>(null)
  const stop = onContentEvent
  const close = (open: boolean): void => {
    if (!open) setMode('closed')
  }
  const triggerEl = (
    <Slot
      ref={triggerRef}
      aria-haspopup="dialog"
      aria-expanded={mode !== 'closed'}
      onClick={() => setMode((m) => (m === 'closed' ? (isPhone() ? 'sheet' : 'popover') : 'closed'))}
    >
      {trigger}
    </Slot>
  )
  return (
    <>
      <Popover open={mode === 'popover'} onOpenChange={close}>
        <PopoverPrimitive.Anchor asChild>{triggerEl}</PopoverPrimitive.Anchor>
        <PopoverContent
          side="bottom"
          avoidCollisions
          role="dialog"
          aria-label={title}
          // A press on the trigger toggles it (its own click handler); don't
          // let it count as an outside press that closes and reopens.
          // There is no Radix Trigger (the anchor is the trigger), so put focus back on it by hand.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            triggerRef.current?.focus()
          }}
          onInteractOutside={(e) => {
            if (triggerRef.current?.contains(e.target as Node)) e.preventDefault()
          }}
          className={cn('max-h-[min(32rem,var(--radix-popover-content-available-height))] overflow-y-auto', contentClassName)}
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={stop}
        >
          {children}
        </PopoverContent>
      </Popover>
      <Sheet open={mode === 'sheet'} onOpenChange={close}>
        <SheetContent
          side="bottom"
          className={cn('max-h-[85dvh] overflow-y-auto rounded-t-xl p-4 pt-5', contentClassName)}
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={stop}
          data-testid="responsive-sheet"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  )
}
