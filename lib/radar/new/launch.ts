import type { Openness } from './types'

/**
 * Launch detection on official lab-feed posts: is a post a model or
 * product launch, and are the weights open? Keyword and structure
 * heuristics only (no model call): a launch verb ("Introducing",
 * "now available", "release"), a versioned model name ("Gemini 3.1",
 * "GPT-5.5", "Llama 4 Scout"), and no "how we / case study" framing.
 * A launch is `proprietary` unless the post links to open weights or says
 * so. Pure.
 */

export interface LaunchInfo {
  launch: boolean
  /** A model (versioned name or "model" wording) rather than a product or feature. */
  model: boolean
  openness: Openness
  /** What was launched ("Gemini 3.1 Flash"), when the title says it. */
  name: string | null
}

const LEAD = /^(?:introducing|announcing|meet|say hello to|welcome)\b[:\s]*/i
const VERB =
  /\b(?:now (?:generally )?available|generally available|is (?:now )?available|now in (?:public )?(?:preview|beta)|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)|rolling out|rolls out|debuts?|unveil(?:s|ed)?|open[- ]sourc(?:e|es|ed|ing))\b/i
const NOT_LAUNCH =
  /\b(?:how (?:we|to)|case study|customer story|webinar|podcast|hiring|recap|lessons|survey|interview with|what we learned|year in review|behind the scenes|tips|guide to)\b/i
// A capitalised name followed by a version: "GPT-5.5", "Gemini 3.1", "Llama 4", "Qwen3.8", "Mistral Large 3", "o4-mini".
const VERSIONED = /\b(?:[A-Z][\w]*(?:[ -][A-Z][\w]*)?[ -]?v?\d+(?:\.\d+)*(?:[ -](?:[A-Z][\w]*|\d+[BbMm]))?|o\d(?:-mini|-pro)?)\b/
const YEARISH = /^(?:19|20)\d{2}$/
const MODEL_WORD = /\b(?:model|models|weights|LLM|checkpoint|VLM|embedding)\b/i
const OPEN_WEIGHTS =
  /\b(?:open[- ]weights?|open[- ]sourc(?:e|ed|ing)\b.{0,60}\bmodel|open[- ]source(?:d)? (?:weights|release)|apache[- ]2\.0|MIT licen[cs]e|available on hugging ?face|download (?:the )?weights)\b/i
const HF_MODEL_LINK = /^https:\/\/huggingface\.co\/(?!spaces\/|datasets\/|blog\/|papers\/|docs\/)[\w.-]+\/[\w.-]+/i

function versionedName(title: string): string | null {
  for (const m of title.matchAll(new RegExp(VERSIONED.source, 'g'))) {
    const text = m[0].trim()
    const digits = /\d+/.exec(text)?.[0] ?? ''
    // "2026", "Top 10" and bare numbers are not model names.
    if (YEARISH.test(digits) || /^\d/.test(text) || /^(?:Top|Part|Day|Week|Q|Chapter|Episode|Step|Phase)\b/i.test(text)) continue
    return text
  }
  return null
}

/** "Introducing Gemini 3.1 Flash: faster…" → "Gemini 3.1 Flash". */
function leadName(title: string): string | null {
  if (!LEAD.test(title)) return null
  const rest = title.replace(LEAD, '').split(/\s[—–-]\s|[:,!?|(]|\.(?:\s|$)/)[0]?.trim() ?? ''
  return rest.length >= 2 && rest.length <= 80 ? rest : null
}

export function detectLaunch(input: { title: string; excerpt?: string; links?: readonly string[] }): LaunchInfo {
  const title = input.title.trim()
  const text = `${title} ${input.excerpt ?? ''}`
  const versioned = versionedName(title)
  const lead = leadName(title)
  const blocked = NOT_LAUNCH.test(title)
  const verbInTitle = VERB.test(title)
  const launch = !blocked && (lead !== null || verbInTitle || (versioned !== null && VERB.test(text)))
  // "AICR v1.0" is software: a v-numbered name is a model only when the post says "model".
  const softwareVersion = versioned !== null && /\bv\d/i.test(versioned)
  const model = launch && (MODEL_WORD.test(title) || (versioned !== null && (!softwareVersion || MODEL_WORD.test(text))))
  const open = OPEN_WEIGHTS.test(text) || (input.links ?? []).some((l) => HF_MODEL_LINK.test(l))
  return { launch, model, openness: open ? 'open' : 'proprietary', name: lead ?? versioned }
}
