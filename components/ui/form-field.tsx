import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  /** The control's id; wires the label and the help/error ids. */
  htmlFor: string
  label: React.ReactNode
  /** Shown after the label in muted text, e.g. "(optional)". */
  hint?: React.ReactNode
  /** Helper line under the control. Give the control aria-describedby={`${htmlFor}-help`}. */
  help?: React.ReactNode
  /** Validation message; replaces the help line. Use aria-describedby={`${htmlFor}-error`}. */
  error?: React.ReactNode
  /** Extra element on the label row's right (a link, a counter). */
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * The one label / control / help / error layout. A fixed-height label row
 * (so fields in a grid row always line their controls up, whatever the
 * label text), then the control, then one 12px line of help or error.
 */
export function FormField({
  htmlFor,
  label,
  hint,
  help,
  error,
  aside,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="truncate">
          {label}
          {hint ? <span className="ml-1 font-normal text-muted-foreground">{hint}</span> : null}
        </Label>
        {aside ? <div className="shrink-0 text-xs">{aside}</div> : null}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : help ? (
        <p id={`${htmlFor}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A grid of fields whose trailing submit button lines up with the controls
 * (not the labels): wrap the button in `FormActions` inside the grid.
 */
export function FormActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 sm:self-end', className)}>{children}</div>
  )
}
