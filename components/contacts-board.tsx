'use client'
import * as React from 'react'
import { Building2, ExternalLink, Mail } from 'lucide-react'
import { moveContact } from '@/app/(authed)/contacts/actions'
import { Board, type BoardColumnDef, type BoardQuickAction } from '@/components/board/board'
import { groupBy } from '@/lib/board/move'
import {
  CONTACT_STAGES,
  CONTACT_STAGE_LABELS,
  CONTACT_STAGE_TONE,
  contactStageOf,
  type ContactStage,
} from '@/lib/contacts/pipeline'

export interface ContactBoardItem {
  id: string
  version: string
  name: string
  role: string | null
  email: string | null
  linkedinUrl: string | null
  companyName: string | null
  stage: ContactStage
}

const HINTS: Partial<Record<ContactStage, string>> = {
  to_contact: 'People worth reaching out to',
  contacted: 'Message sent, waiting for a reply',
  replied: 'They answered: keep the thread warm',
  meeting: 'Call or coffee booked or done',
  referral: 'They referred you or offered to',
}

const COLUMNS: readonly BoardColumnDef<ContactStage>[] = CONTACT_STAGES.map((stage) => ({
  id: stage,
  title: CONTACT_STAGE_LABELS[stage],
  tone: CONTACT_STAGE_TONE[stage],
  hint: HINTS[stage],
  emptyText: stage === 'to_contact' ? 'Add a contact to start' : 'No one here yet',
}))

function renderCard(c: ContactBoardItem): React.ReactNode {
  return (
    <>
      <div className="font-medium leading-tight">{c.name}</div>
      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.role ?? 'No role'}</div>
      {c.companyName ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Building2 className="size-3" aria-hidden="true" />
          {c.companyName}
        </div>
      ) : null}
    </>
  )
}

function cardActions(c: ContactBoardItem): BoardQuickAction[] {
  const actions: BoardQuickAction[] = []
  if (c.email) actions.push({ label: 'Email', icon: Mail, href: `mailto:${c.email}` })
  if (c.linkedinUrl) {
    actions.push({ label: 'Open LinkedIn', icon: ExternalLink, href: c.linkedinUrl, external: true })
  }
  return actions
}

/** Networking board: To contact / Contacted / Replied / Meeting / Referral. */
export function ContactsBoard({ contacts }: { contacts: ContactBoardItem[] }) {
  const items = React.useMemo(() => groupBy(contacts, CONTACT_STAGES, (c) => contactStageOf(c.stage)), [contacts])
  return (
    <Board
      id="contacts"
      label="Networking board"
      columns={COLUMNS}
      items={items}
      itemLabel={(c) => c.name}
      renderCard={renderCard}
      cardActions={cardActions}
      applyMove={(c, to) => ({ ...c, stage: to })}
      onMove={(c, _from, to) => moveContact(c.id, to)}
    />
  )
}
