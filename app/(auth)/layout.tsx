import { MAIN_CONTENT_ID } from '@/components/skip-link'

/** Sign-in: one main landmark, the skip link's target. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      {children}
    </main>
  )
}
