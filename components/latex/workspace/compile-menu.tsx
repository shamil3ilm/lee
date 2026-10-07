'use client'
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  canCompileAnyway,
  COMPILE_ENGINES,
  COMPILE_SERVICES,
  ENGINE_LABELS,
  SERVICE_HINTS,
  SERVICE_LABELS,
  type CompileSettings,
} from '@/lib/latex/compile-settings'
import { cn } from '@/lib/utils'

export interface CompileMenuProps {
  compiling: boolean
  autoCompile: boolean
  onAutoCompile: (on: boolean) => void
  fastMode: boolean
  onFastMode: (on: boolean) => void
  settings: CompileSettings
  onSettings: (next: CompileSettings) => void
  onCompile: () => void
  onClearCache: () => void
}

function Hint({ children }: { children: string }) {
  return <span className="block text-[11px] font-normal leading-snug text-muted-foreground">{children}</span>
}

/**
 * Overleaf-style Recompile split button: the primary action compiles now; the
 * caret opens every compile option, each labelled with what it does.
 */
export function CompileMenu(p: CompileMenuProps) {
  const anyway = canCompileAnyway(p.settings)
  return (
    <div className="inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-md bg-primary text-primary-foreground shadow-sm">
      <button
        type="button"
        onClick={p.onCompile}
        disabled={p.compiling}
        aria-label={p.compiling ? 'Compiling' : 'Recompile'}
        title="Recompile (Ctrl/⌘+Enter)"
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-semibold hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-80"
      >
        {p.compiling ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        {p.compiling ? 'Compiling…' : 'Recompile'}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Compile options"
            className="inline-flex w-6 items-center justify-center border-l border-primary-foreground/25 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem onSelect={p.onCompile}>
            Recompile
            <DropdownMenuShortcut>Ctrl/⌘+Enter</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onClearCache}>
            <span>
              Clear cache and recompile
              <Hint>Compile again even if nothing changed</Hint>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={p.autoCompile} onCheckedChange={(v) => p.onAutoCompile(v === true)}>
            <span>
              Auto compile
              <Hint>Recompiles a moment after you stop typing</Hint>
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Compile mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={p.fastMode ? 'fast' : 'normal'} onValueChange={(v) => p.onFastMode(v === 'fast')}>
            <DropdownMenuRadioItem value="normal">
              <span>
                Normal
                <Hint>Full quality, images included</Hint>
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="fast">
              <span>
                Fast (draft)
                <Hint>Images drawn as boxes; quicker previews</Hint>
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Compiler</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={p.settings.engine}
            onValueChange={(v) => {
              const engine = COMPILE_ENGINES.find((e) => e === v)
              if (engine) p.onSettings({ ...p.settings, engine })
            }}
          >
            {COMPILE_ENGINES.map((e) => (
              <DropdownMenuRadioItem key={e} value={e}>
                {ENGINE_LABELS[e]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Compile service</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={p.settings.service}
            onValueChange={(v) => {
              const service = COMPILE_SERVICES.find((s) => s === v)
              if (service) p.onSettings({ ...p.settings, service })
            }}
          >
            {COMPILE_SERVICES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                <span>
                  {SERVICE_LABELS[s]}
                  <Hint>{SERVICE_HINTS[s]}</Hint>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">On errors</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={p.settings.stopOnError || !anyway ? 'stop' : 'anyway'}
            onValueChange={(v) => p.onSettings({ ...p.settings, stopOnError: v !== 'anyway' })}
          >
            <DropdownMenuRadioItem value="stop">
              <span>
                Stop on first error
                <Hint>No PDF until the errors are fixed</Hint>
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="anyway" disabled={!anyway} className={cn(!anyway && 'opacity-60')}>
              <span>
                Try to compile anyway
                <Hint>{anyway ? 'Show a PDF with the errors listed' : 'Needs the Automatic or Full TeX Live service'}</Hint>
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
