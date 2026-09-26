import { MESSAGING_HOSTS } from '../domains'
import { findAll } from '../text'
import { fired, type Rule } from './types'

const APP = String.raw`(?:telegram|whats\s?app|wechat)`

const MESSAGING = [
  new RegExp(String.raw`\b(?:contact|message|msg|text|reach|ping|dm|apply|chat|connect|write)\b[^.\n]{0,25}\b${APP}\b`),
  new RegExp(String.raw`\b(?:send|share|forward)\s+(?:your\s+)?(?:cv|resume|bio-?data|details|documents)\b[^.\n]{0,25}\b${APP}\b`),
  new RegExp(String.raw`\bjoin\s+(?:our\s+)?${APP}\s+(?:channel|group)\b`),
  new RegExp(String.raw`\b${APP}\s*(?:only\b|no\.?(?=[\s:\d])|number\b|:|@|\+|\d)`),
  /\bwhats\s?app\s+(?:your|us|me|at|to)\b/,
  /(?:t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com)\/\S+/,
]

const CHAT_INTERVIEW = [
  /\binterview\w*\b[^.\n]{0,30}\b(?:via|on|over|through|by)\s+(?:telegram|whats\s?app|wechat|signal|google\s+hangouts|hangouts|text(?:\s+message)?|chat|skype\s+chat|teams\s+chat|instant\s+messag\w*)\b/,
  /\b(?:chat|text)[- ]based\s+interviews?\b/,
  /\bonline\s+chat\s+interviews?\b/,
]

const NO_INTERVIEW = [
  /\bno\s+interviews?\b(?:\s+(?:required|needed|round))?/,
  /\bwithout\s+(?:an?\s+|any\s+)?interviews?\b/,
  /\bdirect\s+(?:joining|selection|appointment|offer)\b/,
  /\binstant\s+(?:offer|joining|selection|hiring|approval)\b/,
  /\bimmediate\s+(?:selection|offer\s+letter)\b/,
  /\bguaranteed\s+(?:job|selection|placement|income|earnings)\b/,
  /\b100\s*%\s*(?:job|placement)\s+guarantee\w*/,
  /\byou\s+(?:have\s+been|are|were)\s+(?:selected|hired)\b/,
]

export const channelRules: readonly Rule[] = [
  {
    id: 'channel.messaging_only',
    group: 'channel',
    weight: 30,
    label: 'Contact is via Telegram / WhatsApp instead of a company channel',
    detect(ctx) {
      const text = MESSAGING.flatMap((p) => findAll(ctx.fields, p, undefined, { negatable: true }))
      const links = ctx.hosts.filter((h) => h.field !== 'description' && MESSAGING_HOSTS.has(h.host)).map((h) => h.span)
      return fired([...links, ...text].slice(0, 3))
    },
  },
  {
    id: 'channel.chat_interview',
    group: 'channel',
    weight: 30,
    label: 'Interview happens over chat only',
    detect: (ctx) => fired(CHAT_INTERVIEW.flatMap((p) => findAll(ctx.fields, p)).slice(0, 3)),
  },
  {
    id: 'channel.offer_without_interview',
    group: 'channel',
    weight: 35,
    label: 'Offer or selection without any interview',
    detect: (ctx) => fired(NO_INTERVIEW.flatMap((p) => findAll(ctx.fields, p)).slice(0, 3)),
  },
]
