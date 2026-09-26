/** Interview stage kinds offered by the add/edit stage forms. Client-safe. */
export const STAGE_KINDS = [
  { value: 'phone_screen', label: 'Phone screen' },
  { value: 'technical', label: 'Technical' },
  { value: 'system_design', label: 'System design' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'final', label: 'Final' },
  { value: 'other', label: 'Other' },
] as const

export const STAGE_KIND_VALUES = STAGE_KINDS.map((k) => k.value) as [string, ...string[]]
