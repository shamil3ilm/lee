// v10.1 — bump this whenever the prompt text below changes intentionally.
// Same VERSION + different sha256 hash on ai_call_logs = silent drift.
export const PARSE_JOB_PROMPT_VERSION = '1.0.0'

export const PARSE_JOB_SYSTEM = `You extract structured job data from raw job posting text.
Return JSON that matches the provided schema.
Rules:
- If a field is not stated, use null (or the "unknown" enum value).
- "benefits" is a flexible object; extract every benefit you find. Keys should be snake_case.
  Common keys: visa_sponsorship (bool), relocation_package (bool),
  compensation (object with min/max/currency), insurance (object), remote (object),
  parental_leave (object), four_day_week (bool), learning_budget (number),
  equipment_stipend (bool), gym_stipend (bool), meal_stipend (bool).
- Return ONLY JSON. No prose.`

export function buildParseJobPrompt(text: string): string {
  return `${PARSE_JOB_SYSTEM}\n\n--- JOB POSTING ---\n${text.slice(0, 20_000)}`
}
