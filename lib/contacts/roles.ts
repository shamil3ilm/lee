/**
 * Roles a contact can play on an application (the `application_contacts.role`
 * link, not the contact's own job title). Client-safe: no imports.
 */
export const CONTACT_LINK_ROLES = [
  'recruiter',
  'hiring_manager',
  'interviewer',
  'referrer',
  'other',
] as const

export type ContactLinkRole = (typeof CONTACT_LINK_ROLES)[number]

export const CONTACT_LINK_ROLE_LABELS: Record<ContactLinkRole, string> = {
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
  interviewer: 'Interviewer',
  referrer: 'Referrer',
  other: 'Other',
}

export function isContactLinkRole(v: unknown): v is ContactLinkRole {
  return typeof v === 'string' && (CONTACT_LINK_ROLES as readonly string[]).includes(v)
}
