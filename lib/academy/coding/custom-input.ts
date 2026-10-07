import type { FunctionSpec } from '@/lib/academy/problems/schema'

/**
 * Custom input for Run: one JSON value per parameter, one per line (blank
 * lines ignored), like the sample format shown in the console. SQL problems
 * take INSERT statements instead. Pure and client-safe.
 */

export type CustomInput = { ok: true; args: unknown[] } | { ok: false; error: string }

export function parseCustomArgs(text: string, fn: Pick<FunctionSpec, 'params'>): CustomInput {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  if (lines.length !== fn.params.length) {
    return { ok: false, error: `Enter ${fn.params.length} line${fn.params.length === 1 ? '' : 's'}: one JSON value per parameter (${fn.params.map((p) => p.name).join(', ')}).` }
  }
  const args: unknown[] = []
  for (const [i, line] of lines.entries()) {
    try {
      args.push(JSON.parse(line))
    } catch {
      return { ok: false, error: `Line ${i + 1} (${fn.params[i]?.name ?? 'value'}) is not valid JSON. Strings need double quotes.` }
    }
  }
  return { ok: true, args }
}

/** A sample's arguments as editable text (the custom input's starting point). */
export function argsToText(args: readonly unknown[]): string {
  return args.map((a) => JSON.stringify(a)).join('\n')
}
