'use client'
import * as React from 'react'
import { CompanyActions } from '@/components/company-actions'
import { CompanyEditDialog, type CompanyEditFields } from '@/components/company-edit-dialog'

interface CompanyHeaderActionsProps {
  companyId: string
  companyName: string
  initial: CompanyEditFields
}

/**
 * Colocates the header action buttons with the edit dialog they open. Keeps
 * dialog visibility state in a single client component so the server-rendered
 * page can stay lean.
 */
export function CompanyHeaderActions({ companyId, companyName, initial }: CompanyHeaderActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false)
  return (
    <>
      <CompanyActions
        companyId={companyId}
        companyName={companyName}
        onEdit={() => setEditOpen(true)}
      />
      <CompanyEditDialog
        companyId={companyId}
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initial}
      />
    </>
  )
}
