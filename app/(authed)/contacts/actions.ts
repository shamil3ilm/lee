'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import {
  ContactScopeError,
  createContact,
  deleteContact as svcDeleteContact,
  linkContactToApplication,
  unlinkContactFromApplication,
  updateContact as svcUpdateContact,
} from '@/lib/contacts/service'
import { isContactLinkRole } from '@/lib/contacts/roles'
import { CONTACT_STAGES, storedContactStage } from '@/lib/contacts/pipeline'
import * as contactsQ from '@/lib/db/queries/contacts'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: optionalText(50),
  linkedinUrl: z.string().trim().url('Enter a valid LinkedIn URL').optional().or(z.literal('')),
  role: optionalText(200),
  companyId: z.string().uuid().optional().or(z.literal('')),
  notes: optionalText(10_000),
})

const idSchema = z.string().uuid()

type ContactFields = z.infer<typeof schema>

function parseForm(formData: FormData): { data: ContactFields } | { error: string } {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  return { data: parsed.data }
}

/** Blank strings become null so the edit form can clear a field. */
function toColumns(d: ContactFields) {
  return {
    name: d.name,
    email: d.email || null,
    phone: d.phone || null,
    linkedinUrl: d.linkedinUrl || null,
    role: d.role || null,
    companyId: d.companyId || null,
    notes: d.notes || null,
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function revalidateContacts(): void {
  revalidatePath('/contacts')
  revalidatePath('/companies/[id]', 'page')
}

export async function addContact(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = parseForm(formData)
    if ('error' in parsed) return parsed
    await createContact({ userId, ...toColumns(parsed.data) })
    revalidateContacts()
    return { success: true }
  } catch (err) {
    if (err instanceof ContactScopeError) return { error: 'Company not found.' }
    logger.error('addContact failed', { err: errMessage(err) })
    return { error: 'Could not add contact.' }
  }
}

export async function updateContact(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(id).success) return { error: 'Contact not found.' }
    const parsed = parseForm(formData)
    if ('error' in parsed) return parsed
    const updated = await svcUpdateContact(userId, id, toColumns(parsed.data))
    if (!updated) return { error: 'Contact not found.' }
    revalidateContacts()
    return { success: true }
  } catch (err) {
    if (err instanceof ContactScopeError) return { error: 'Company not found.' }
    logger.error('updateContact failed', { id, err: errMessage(err) })
    return { error: 'Could not update contact.' }
  }
}

export async function deleteContact(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(id).success) return { error: 'Contact not found.' }
    const ok = await svcDeleteContact(userId, id)
    if (!ok) return { error: 'Contact not found.' }
    revalidateContacts()
    revalidatePath('/applications/[id]', 'page')
    return { success: true }
  } catch (err) {
    logger.error('deleteContact failed', { id, err: errMessage(err) })
    return { error: 'Could not delete contact.' }
  }
}

async function runLink(
  op: 'link' | 'unlink',
  applicationId: string,
  contactId: string,
  role: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(applicationId).success || !idSchema.safeParse(contactId).success) {
      return { error: 'Contact or application not found.' }
    }
    if (!isContactLinkRole(role)) return { error: 'Pick a valid role.' }
    const args = { userId, applicationId, contactId, role }
    if (op === 'link') await linkContactToApplication(args)
    else await unlinkContactFromApplication(args)
    revalidatePath(`/applications/${applicationId}`)
    return { success: true }
  } catch (err) {
    if (err instanceof ContactScopeError) return { error: 'Contact or application not found.' }
    logger.error(`${op}Contact failed`, { applicationId, err: errMessage(err) })
    return { error: op === 'link' ? 'Could not link contact.' : 'Could not unlink contact.' }
  }
}

export async function linkContactAction(
  applicationId: string,
  contactId: string,
  role: string,
): Promise<ActionResult> {
  return runLink('link', applicationId, contactId, role)
}

export async function unlinkContactAction(
  applicationId: string,
  contactId: string,
  role: string,
): Promise<ActionResult> {
  return runLink('unlink', applicationId, contactId, role)
}

const moveSchema = z.object({
  contactId: z.string().uuid(),
  stage: z.enum(CONTACT_STAGES),
})

/**
 * Networking board: To contact / Contacted / Replied / Meeting / Referral.
 * Zod-validated and scoped to the signed-in user.
 */
export async function moveContact(contactId: string, stage: string): Promise<ActionResult> {
  const parsed = moveSchema.safeParse({ contactId, stage })
  if (!parsed.success) return { error: 'Invalid move.' }
  try {
    const userId = await requireUserId()
    const row = await contactsQ.setPipelineStage(
      userId,
      parsed.data.contactId,
      storedContactStage(parsed.data.stage),
    )
    if (!row) return { error: 'Contact not found.' }
    revalidateContacts()
    return { success: true }
  } catch (err) {
    logger.error('moveContact failed', { err: errMessage(err) })
    return { error: 'Could not move the contact.' }
  }
}
