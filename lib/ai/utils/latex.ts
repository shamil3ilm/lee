/**
 * LLMs frequently wrap LaTeX output in ```latex ... ``` fences even when told
 * not to. Strip a single leading + trailing code fence conservatively.
 * Idempotent: no-ops if no fence is present.
 */
export function stripLatexFencing(input: string): string {
  let s = input.trim()
  // Leading ```latex or ```tex or plain ```
  const openMatch = s.match(/^```(?:latex|tex)?\s*\n?/i)
  if (openMatch) s = s.slice(openMatch[0].length)
  // Trailing ```
  if (s.endsWith('```')) s = s.slice(0, -3)
  return s.trim()
}
