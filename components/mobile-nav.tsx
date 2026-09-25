'use client'
import * as React from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from '@/components/sidebar'
import type { NavBadges } from '@/components/nav/nav-config'

interface MobileNavProps {
  email?: string | null
  name?: string | null
  image?: string | null
  badges?: NavBadges
}

export function MobileNav({ email, name, image, badges }: MobileNavProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {/* Same grouped sidebar; rail mode is desktop-only. */}
        <Sidebar
          className="border-r-0"
          onNavigate={() => setOpen(false)}
          email={email}
          name={name}
          image={image}
          badges={badges}
        />
      </SheetContent>
    </Sheet>
  )
}
