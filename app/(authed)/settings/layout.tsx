import { SettingsNav } from '@/components/settings/settings-nav'

/**
 * Settings: one navigation level ("You" and "System" groups), then the
 * page. A left column from `lg` up; a scrolling row above the page below
 * that. Pages keep their own max-w-4xl reading width.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <SettingsNav />
      <div className="min-w-0 max-w-4xl space-y-6">{children}</div>
    </div>
  )
}
