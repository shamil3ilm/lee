/**
 * The one status-colour vocabulary. Every status badge, kanban column,
 * scam level, cv-score grade and chart series that means "good / bad /
 * waiting / a pipeline stage" picks a Tone here instead of a raw Tailwind
 * colour. Tokens live in app/globals.css; contrast is enforced by
 * tests/unit/design-tokens.test.ts. Class strings are written out in full so
 * Tailwind's scanner sees them.
 */
export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type StageTone =
  | 'saved'
  | 'applied'
  | 'screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
export type Tone = SemanticTone | StageTone

/** Strong text colour (icons, column titles, inline status words). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-neutral',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  saved: 'text-stage-saved',
  applied: 'text-stage-applied',
  screen: 'text-stage-screen',
  interview: 'text-stage-interview',
  offer: 'text-stage-offer',
  rejected: 'text-stage-rejected',
  withdrawn: 'text-stage-withdrawn',
}

/** Tinted surface + strong text: badges, pills, callouts. */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  saved: 'bg-stage-saved-soft text-stage-saved',
  applied: 'bg-stage-applied-soft text-stage-applied',
  screen: 'bg-stage-screen-soft text-stage-screen',
  interview: 'bg-stage-interview-soft text-stage-interview',
  offer: 'bg-stage-offer-soft text-stage-offer',
  rejected: 'bg-stage-rejected-soft text-stage-rejected',
  withdrawn: 'bg-stage-withdrawn-soft text-stage-withdrawn',
}

/** Solid fill (dots, meters, progress bars). */
export const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-neutral',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  saved: 'bg-stage-saved',
  applied: 'bg-stage-applied',
  screen: 'bg-stage-screen',
  interview: 'bg-stage-interview',
  offer: 'bg-stage-offer',
  rejected: 'bg-stage-rejected',
  withdrawn: 'bg-stage-withdrawn',
}

/** Tinted border for callouts that sit on the soft surface. */
export const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-neutral/30',
  info: 'border-info/30',
  success: 'border-success/30',
  warning: 'border-warning/30',
  danger: 'border-danger/30',
  saved: 'border-stage-saved/30',
  applied: 'border-stage-applied/30',
  screen: 'border-stage-screen/30',
  interview: 'border-stage-interview/30',
  offer: 'border-stage-offer/30',
  rejected: 'border-stage-rejected/30',
  withdrawn: 'border-stage-withdrawn/30',
}

const CSS_VAR: Record<Tone, string> = {
  neutral: '--neutral',
  info: '--info',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  saved: '--stage-saved',
  applied: '--stage-applied',
  screen: '--stage-screen',
  interview: '--stage-interview',
  offer: '--stage-offer',
  rejected: '--stage-rejected',
  withdrawn: '--stage-withdrawn',
}

/** CSS colour for SVG/recharts props (`fill`, `stroke`) — theme-aware. */
export function toneColor(tone: Tone): string {
  return `hsl(var(${CSS_VAR[tone]}))`
}
