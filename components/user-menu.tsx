'use client'
import { useTransition } from 'react'
import Image from 'next/image'
import { LogOut, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOutAction } from '@/app/(authed)/actions'

interface UserMenuProps {
  email: string
  name?: string | null
  image?: string | null
}

function initials(email: string, name?: string | null): string {
  const base = name?.trim() || email
  const parts = base.split(/[\s@.]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function UserMenu({ email, name, image }: UserMenuProps) {
  const [signingOut, startTransition] = useTransition()
  const shown = initials(email, name)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full transition-transform hover:scale-105"
          // WCAG 2.5.3 (label in name): with no photo the visible initials
          // must be part of the accessible name.
          aria-label={image ? 'User menu' : `User menu, ${shown}`}
        >
          {image ? (
            <Image
              src={image}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
              unoptimized
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
              {shown}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            {name ? <span className="truncate text-sm font-medium">{name}</span> : null}
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Not a <form>: selecting an item closes and unmounts the menu
            before a nested form can submit, so nothing happened. */}
        <DropdownMenuItem disabled={signingOut} onSelect={() => startTransition(() => signOutAction())}>
          <LogOut className="h-4 w-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
