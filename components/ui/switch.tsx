import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'children'> {
  ref?: React.Ref<HTMLInputElement>
  /** Visible label. When set, the text sits left and the switch right, as one row. */
  label?: React.ReactNode
  /** Helper line under the label, linked with aria-describedby. */
  description?: React.ReactNode
  /** Classes for the label text column (only with `label`). */
  labelClassName?: string
}

/**
 * Track and thumb. Off: an outlined track (muted-foreground border, ≥ 6:1 on
 * the card) with a small muted thumb; on: a solid primary track with a
 * light thumb at the right. State reads from position and fill, never from
 * colour alone.
 */
const TRACK =
  'pointer-events-none inline-flex h-5 w-9 items-center rounded-full border-2 border-muted-foreground bg-card transition-colors ' +
  'peer-checked:border-primary peer-checked:bg-primary ' +
  'peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-primary-foreground ' +
  'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ' +
  'peer-disabled:opacity-50'

/** Transparent native input over the track; 36×24 hit area (WCAG 2.5.8). */
const INPUT =
  'peer absolute inset-x-0 -inset-y-0.5 z-10 m-0 h-6 w-9 cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed'

/**
 * Switch: a native checkbox with `role="switch"`, so it submits with forms,
 * renders from server components, and is announced as on/off. Use it for a
 * setting that takes effect immediately ("Send the weekly digest"); don't
 * add "On"/"Off" text next to it. Use `Checkbox` for selection and opt-ins.
 */
export function Switch({ label, description, className, labelClassName, id, ...props }: SwitchProps) {
  const autoId = React.useId()
  const inputId = id ?? (label ? autoId : undefined)
  const descriptionId = description ? `${inputId ?? autoId}-description` : undefined
  const describedBy = [props['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined

  const control = (
    <span data-slot="switch" className={cn('relative inline-flex h-5 w-9 shrink-0', label ? 'mt-0.5' : className)}>
      <input {...props} id={inputId} type="checkbox" role="switch" aria-describedby={describedBy} className={INPUT} />
      <span aria-hidden="true" className={TRACK}>
        <span className="ml-0.5 size-3 rounded-full bg-muted-foreground shadow-sm transition-transform" />
      </span>
    </span>
  )
  if (!label) return control
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex items-start justify-between gap-4 text-sm',
        props.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <span className={cn('min-w-0 space-y-0.5', labelClassName)}>
        <span className="block font-medium leading-5">{label}</span>
        {description ? (
          <span id={descriptionId} className="block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {control}
    </label>
  )
}
