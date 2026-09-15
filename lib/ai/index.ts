import { env } from '@/lib/env'
import type { AIProvider } from './types'
import { GeminiProvider } from './gemini'
import { GroqProvider } from './groq'

let cached: AIProvider | undefined

export function getAIProvider(): AIProvider {
  if (cached) return cached
  switch (env.AI_PROVIDER) {
    case 'gemini':
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
      cached = new GeminiProvider(env.GEMINI_API_KEY)
      return cached
    case 'groq':
      if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
      cached = new GroqProvider(env.GROQ_API_KEY)
      return cached
    case 'anthropic':
    case 'openai':
      throw new Error(
        `AI provider "${env.AI_PROVIDER}" is scheduled for a future release; use "gemini" or "groq" in v1`,
      )
    default:
      throw new Error(`AI_PROVIDER ${env.AI_PROVIDER} not implemented`)
  }
}

export type { AIProvider } from './types'
