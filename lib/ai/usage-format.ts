import type { AiUsage } from './usage-types'

/**
 * Display formatting for per-response AI usage. Pure — shared by the usage
 * badge (client) and tests.
 */

const num = new Intl.NumberFormat('en-US')

export function shortModel(model: string | null | undefined): string | null {
  if (!model) return null
  return model.replace(/^[\w.-]+\//, '').replace(/-versatile$/, '')
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function formatUsageLine(u: AiUsage): string {
  if (u.skipped) return 'Skipped · no model call'
  if (u.cached) return 'Cached · no model call'
  const parts: string[] = []
  if (u.audioSeconds != null) {
    parts.push(`${Number(u.audioSeconds.toFixed(1))} s audio`)
  } else {
    parts.push(`${num.format(u.inputTokens)} in`, `${num.format(u.outputTokens)} out`)
  }
  const model = shortModel(u.model)
  if (model) parts.push(model)
  parts.push(formatLatency(u.latencyMs))
  return parts.join(' · ')
}

export function formatUsageDetails(u: AiUsage): string[] {
  const lines = [`Provider: ${u.provider}`]
  if (u.model) lines.push(`Model: ${u.model}`)
  if (u.audioSeconds != null) lines.push(`Audio: ${u.audioSeconds} s`)
  else lines.push(`Tokens: ${num.format(u.inputTokens)} input, ${num.format(u.outputTokens)} output`)
  lines.push(`Latency: ${formatLatency(u.latencyMs)}`)
  if (u.calls > 1) lines.push(`Model calls: ${u.calls}`)
  if (u.failedAttempts > 0) {
    const rl = u.rateLimited > 0 ? ` (${u.rateLimited} rate-limited)` : ''
    lines.push(`Retries: ${u.failedAttempts} failed attempt${u.failedAttempts === 1 ? '' : 's'}${rl}`)
  }
  if (u.skipped) lines.push('Signal check skipped the model call')
  lines.push('Estimated cost: $0 (free tier)')
  return lines
}
