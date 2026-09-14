import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'

export const dynamic = 'force-dynamic'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/signin')
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <Sidebar />
      <main className="p-6">{children}</main>
    </div>
  )
}
