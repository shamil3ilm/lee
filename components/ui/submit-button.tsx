'use client'
import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'

interface SubmitButtonProps extends Omit<ButtonProps, 'type'> {
  pendingLabel?: string
}

/**
 * Form-aware submit button. When the enclosing <form> action is pending it
 * disables itself and shows a spinner. Keeps the child label visible so the
 * user still sees what they clicked; only prepends the spinner.
 *
 * Use inside a server-action <form action={fn}> or the async client-side
 * pattern of `fd => await action(fd)` — both trigger useFormStatus.
 */
export function SubmitButton({
  children,
  disabled,
  pendingLabel,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button {...rest} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}
