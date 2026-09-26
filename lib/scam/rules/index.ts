import { channelRules } from './channel'
import { contentRules } from './content'
import { identityRules } from './identity'
import { moneyRules } from './money'
import { senderRules } from './sender'
import type { Rule } from './types'

/** Every deterministic rule, in display order. Changing this list bumps RULES_VERSION. */
export const RULES: readonly Rule[] = [
  ...moneyRules,
  ...identityRules,
  ...channelRules,
  ...senderRules,
  ...contentRules,
]
