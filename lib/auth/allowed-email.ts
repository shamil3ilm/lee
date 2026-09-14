import { env } from '@/lib/env'

export function isAllowedEmail(email: string | null | undefined): boolean {
  return (
    typeof email === 'string' &&
    email.length > 0 &&
    email.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase()
  )
}
