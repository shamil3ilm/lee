'use client'
import { NativeSelect } from '@/components/ui/native-select'
import {
  COMPILE_ENGINES,
  COMPILE_SERVICES,
  ENGINE_LABELS,
  SERVICE_LABELS,
  type CompileEngine,
  type CompileService,
  type CompileSettings,
} from '@/lib/latex/compile-settings'

interface CompileSettingsControlProps {
  value: CompileSettings
  onChange: (next: CompileSettings) => void
}

function isService(v: string): v is CompileService {
  return (COMPILE_SERVICES as readonly string[]).includes(v)
}

function isEngine(v: string): v is CompileEngine {
  return (COMPILE_ENGINES as readonly string[]).includes(v)
}

/** Compile service and TeX engine for this document (saved with it on compile). */
export function CompileSettingsControl({ value, onChange }: CompileSettingsControlProps) {
  return (
    <div className="flex items-center gap-1">
      <NativeSelect
        aria-label="Compiler"
        title="Compile service. Auto retries on a full TeX Live when latexonline.cc lacks a package."
        value={value.service}
        onChange={(e) => {
          if (isService(e.target.value)) onChange({ ...value, service: e.target.value })
        }}
        className="h-7 max-w-[13rem] py-0 pl-2 pr-7 text-xs"
      >
        {COMPILE_SERVICES.map((s) => (
          <option key={s} value={s}>
            {SERVICE_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="TeX engine"
        title="TeX engine. fontspec needs XeLaTeX or LuaLaTeX."
        value={value.engine}
        onChange={(e) => {
          if (isEngine(e.target.value)) onChange({ ...value, engine: e.target.value })
        }}
        className="h-7 py-0 pl-2 pr-7 text-xs"
      >
        {COMPILE_ENGINES.map((engine) => (
          <option key={engine} value={engine}>
            {ENGINE_LABELS[engine]}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
