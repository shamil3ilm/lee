import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  ref?: React.Ref<HTMLInputElement>
  /** Visible label. When set, the box and text render as one clickable row. */
  label?: React.ReactNode
  /** Helper line under the label, linked with aria-describedby. */
  description?: React.ReactNode
  /** Classes for the label text column (only with `label`). */
  labelClassName?: string
}

/**
 * The visual box: a 16px token-styled square drawn behind a transparent
 * native input. The input overhangs the box by 4px on every side, so the
 * hit area is 24×24 (WCAG 2.5.8) while the box stays 16px. `shrink-0` keeps
 * it square next to long titles.
 */
const BOX =
  'pointer-events-none grid size-4 place-items-center rounded-[4px] border border-muted-foreground bg-card text-primary-foreground transition-colors ' +
  'peer-hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:visible ' +
  'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ' +
  'peer-disabled:opacity-50'

/** The native input, transparent, on top of the box with a 24px hit area. */
const INPUT =
  'peer absolute -inset-1 z-10 m-0 size-6 cursor-pointer appearance-none rounded-sm opacity-0 disabled:cursor-not-allowed'

/**
 * Checkbox: a styled native `<input type="checkbox">`, so it works in GET and
 * server-action forms (`name`, `value`, `defaultChecked`), in server
 * components, and with `getByRole('checkbox')`. Use it for selection and
 * opt-ins; use `Switch` for an "enabled" state that applies at once.
 *
 * Without `label`, `className` positions the box (e.g. `mt-0.5` beside a
 * multi-line text block in a wrapping `<label>`). With `label`, it styles
 * the whole row.
 */
export function Checkbox({ label, description, className, labelClassName, id, ...props }: CheckboxProps) {
  const autoId = React.useId()
  const inputId = id ?? (label ? autoId : undefined)
  const descriptionId = description ? `${inputId ?? autoId}-description` : undefined
  const describedBy = [props['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined

  const box = (
    <span data-slot="checkbox" className={cn('relative inline-flex size-4 shrink-0', label ? 'mt-0.5' : className)}>
      <input {...props} id={inputId} type="checkbox" aria-describedby={describedBy} className={INPUT} />
      <span aria-hidden="true" className={BOX}>
        <Check className="invisible size-3" strokeWidth={3} />
      </span>
    </span>
  )
  if (!label) return box
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex items-start gap-2.5 text-sm',
        props.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      {box}
      <span className={cn('min-w-0 space-y-0.5', labelClassName)}>
        <span className="block leading-5">{label}</span>
        {description ? (
          <span id={descriptionId} className="block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}
