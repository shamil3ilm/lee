'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { startPlacementAction, startPlanItemAction, startSkillPracticeAction } from '@/app/(authed)/playground/actions'
import { Button, type ButtonProps } from '@/components/ui/button'

interface StartButtonProps {
  kind: 'plan' | 'placement' | 'skill'
  /** Plan item id or skill id. */
  id?: string
  label: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
  ariaLabel?: string
}

/** Starts (or resumes) an attempt and opens the workbench. */
export function StartButton({ kind, id = '', label, variant = 'outline', size = 'sm', className, ariaLabel }: StartButtonProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const onClick = (): void => {
    start(async () => {
      const r =
        kind === 'plan' ? await startPlanItemAction(id) : kind === 'skill' ? await startSkillPracticeAction(id) : await startPlacementAction()
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      router.push(r.href)
    })
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={onClick} disabled={pending} className={className} aria-label={ariaLabel}>
      <Play aria-hidden />
      {pending ? 'Starting…' : label}
    </Button>
  )
}
