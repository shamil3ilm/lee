'use client'
import { Files, Paperclip, Search } from 'lucide-react'
import type { SidePanel } from '@/lib/latex/editor-prefs'
import { IconButton } from './icon-button'

interface SideRailProps {
  panel: SidePanel
  onPanel: (panel: SidePanel) => void
  onAssets: () => void
  assetCount: number
}

/** The left icon rail: Files (with the outline), Search, Assets. */
export function SideRail({ panel, onPanel, onAssets, assetCount }: SideRailProps) {
  const toggle = (p: Exclude<SidePanel, null>) => onPanel(panel === p ? null : p)
  return (
    <nav aria-label="Editor panels" className="flex w-10 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-1.5">
      <IconButton label="Files and outline" side="right" pressed={panel === 'files'} onClick={() => toggle('files')}>
        <Files />
      </IconButton>
      <IconButton label="Search in project" side="right" pressed={panel === 'search'} onClick={() => toggle('search')}>
        <Search />
      </IconButton>
      <IconButton
        label={`Assets${assetCount ? ` (${assetCount})` : ''}`}
        tip="Assets: upload, insert, attach from Drive"
        side="right"
        onClick={onAssets}
      >
        <Paperclip />
      </IconButton>
    </nav>
  )
}
