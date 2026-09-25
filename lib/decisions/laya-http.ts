import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'
import { LayaUnavailableError } from './types'

/**
 * Laya decision provider — HTTP client for a future self-hosted Laya Space.
 *
 * v8: STUB ONLY. Every method throws LayaUnavailableError; the composed
 * provider in ./index.ts catches this and falls back to Groq → heuristic
 * so the DECISION_PROVIDER=laya env path is safe to set even before the
 * Space is deployed.
 *
 * TODO(v8.1): implement fetch to LAYA_ENDPOINT.
 * Expected contract: `POST {endpoint}/v1/systemone` with a Jev-compatible
 * body — `{ "system_one": { "input": <text>, "options": [...] } }` etc.
 * Optional Bearer auth via `LAYA_API_KEY`. Response returns the pick /
 * answer / score with a confidence score. When implemented, mirror the
 * validation shape used in ./groq.ts so caller behaviour is identical.
 */
export class LayaHttpDecisionProvider implements DecisionProvider {
  constructor(
    // Present but unused today. Kept in the signature so v8.1 slots in
    // without changing call sites.
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    // Silence unused-private-property warnings in strict builds while
    // preserving the intended API surface.
    void this.endpoint
    void this.apiKey
  }

  async choice<T extends string>(_input: ChoiceInput<T>): Promise<ChoiceResult<T>> {
    throw new LayaUnavailableError()
  }

  async yesNo(_input: YesNoInput): Promise<YesNoResult> {
    throw new LayaUnavailableError()
  }

  async score(_input: ScoreInput): Promise<ScoreResult> {
    throw new LayaUnavailableError()
  }
}
