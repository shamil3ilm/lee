'use client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ExpenseMonthPickerProps {
  value: string
}

/**
 * Native `<input type="month">` bound to the ?month= query param on
 * /expenses. Changing the value pushes a new URL so the server component
 * refetches with the new bounds — no local state to keep in sync.
 */
export function ExpenseMonthPicker({ value }: ExpenseMonthPickerProps) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="month" className="text-xs text-muted-foreground">
        Month
      </Label>
      <Input
        id="month"
        type="month"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (!v) return
          router.push(`/expenses?month=${v}`)
        }}
        className="h-8 w-auto min-w-[9rem]"
      />
    </div>
  )
}
