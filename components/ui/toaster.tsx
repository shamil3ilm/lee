'use client'
import { useTheme } from 'next-themes'
import { Toaster as SonnerToaster } from 'sonner'

/**
 * Theme-aware sonner Toaster. Sonner ships light/dark palettes but does not
 * observe next-themes on its own; we read the resolved theme and pass it in
 * so toasts match the rest of the app in both modes.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light'
  return <SonnerToaster theme={theme} richColors closeButton position="top-right" />
}
