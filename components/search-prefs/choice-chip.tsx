import { cn } from '@/lib/utils'

interface ChoiceChipProps {
  name: string
  value: string
  label: string
  defaultChecked?: boolean
  type?: 'checkbox' | 'radio'
  hint?: string
}

/**
 * A native checkbox/radio styled as a pill, so the form stays a plain
 * <form> (FormData, keyboard and screen-reader behaviour for free).
 */
export function ChoiceChip({ name, value, label, defaultChecked, type = 'checkbox', hint }: ChoiceChipProps) {
  return (
    <label
      title={hint}
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
        'text-muted-foreground hover:bg-muted',
        'has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
      )}
    >
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      {label}
    </label>
  )
}

interface FieldsetProps {
  legend: string
  description?: string
  children: React.ReactNode
}

export function PrefsFieldset({ legend, description, children }: FieldsetProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">{children}</div>
    </fieldset>
  )
}
