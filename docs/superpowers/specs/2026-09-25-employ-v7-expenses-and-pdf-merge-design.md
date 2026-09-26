# lee — v7 Expenses + PDF Merger Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Two independent features shipped together
**Depends on:** v1-v6.1 + v4.2 all shipped

---

## Feature A — Expense tracker

### Overview
Personal expense log with hierarchical classifications, monthly totals, budgets, and a chart. Adjacent to job-hunt (same DB, same auth, same charts library) but standalone. Useful during job search — knowing your monthly burn informs comp negotiation and runway.

### Data model

New table:
```sql
create table expenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  date           date not null,
  amount_cents   integer not null,
  currency       text not null default 'AED',
  category       text not null,      -- top-level category (see enum below)
  subcategory    text,               -- optional (e.g. category=subscription, subcategory=streaming)
  vendor         text,               -- e.g. "Netflix", "DEWA"
  description    text,
  recurring      boolean not null default false,
  recurring_period text,             -- 'monthly' | 'annual' | null
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index expenses_user_date_idx on expenses (user_id, date);
create index expenses_user_category_idx on expenses (user_id, category);
```

New table for budgets:
```sql
create table expense_budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  category      text not null,       -- matches expenses.category values
  monthly_cap_cents integer not null,
  currency      text not null default 'AED',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, category)
);
```

**Category enum (as text values):**
`subscription | food | groceries | dining | electricity | utilities | water | internet | transport | fuel | housing | rent | mortgage | health | insurance | entertainment | education | shopping | travel | gifts | fees | tax | other`

Two-tier: user can pick a top-level; subcategory is freeform.

### Routes
- `/expenses` — main page: this-month total, per-category breakdown, add-expense button, recent list
- `/expenses/[id]/edit` — edit modal (or inline)
- `/expenses/budgets` — set monthly caps per category
- `/expenses/import` — CSV import (paste or upload) for backfill

### API
- `GET /api/expenses` — list with `?month=YYYY-MM` filter
- `POST /api/expenses` — create
- `PATCH /api/expenses/[id]` — update
- `DELETE /api/expenses/[id]`
- `POST /api/expenses/import` — CSV batch
- `GET /api/expenses/export` — CSV download

### Analytics integration
- New card on `/analytics`: **Monthly expenses** — bar chart of last 6 months totals, colored segments per category
- New card: **Budget vs actual** — horizontal bars per category showing budget line and month-to-date spend

### UI
- Sidebar: new "Expenses" group with "Overview", "Budgets", "Import" entries (icon: `Wallet` from lucide)
- `/expenses` page: header (this-month total, month picker), category cards (top 6 categories, spend + budget %), recent transactions table
- Quick-add form at top of `/expenses` (Amount, Category, Vendor, Date) for one-tap logging

### AI helper (optional, v7.1)
- "Categorize this bank statement paste" — user pastes lines from a statement; AI parses each into structured expenses. Uses existing `AIProvider` interface; new `categorizeExpenses` method.

---

## Feature B — PDF merger

### Overview
Combine multiple documents into a single PDF per application (or ad-hoc). Typical scenarios:
- CV + cover letter → one file
- CV + cover letter + certificates → application package
- Multiple certificates → single certifications packet

### Data model

Reuse existing `documents` table with new kind:
- `merged_pdf` — stored bytes NOT persisted (regenerated on demand); content = `{sourceDocumentIds: string[], sourceAssetIds: string[], mergedAt: string}`

Optional: store the merged PDF bytes in a new `document_pdfs` table if we want caching. For MVP, regenerate on download to keep DB small.

### Route
- `POST /api/documents/merge` — body `{documentIds?: string[], assetIds?: string[], applicationId?: string, title?: string}` — generates merged PDF, saves as documents row with kind='merged_pdf', returns `{documentId, downloadUrl}`
- `GET /api/documents/[id]/pdf` — dispatcher already covers this; add case for `merged_pdf` that regenerates from source list

### Merger implementation
Install `pdf-lib` (pure JS, ~200KB gz, no native deps, well-tested on Vercel).

`lib/documents/merge.ts`:
```typescript
export async function mergePdfs({
  userId, sources
}: {
  userId: string
  sources: Array<{ kind: 'document' | 'asset'; id: string }>
}): Promise<Buffer>
```

For each source:
- If `kind='document'`: load the document, if it's a PDF-producing kind (cv/tailored/cover_letter/prep_pack/latex_cv/latex_cover_letter), call the existing render pipeline to get the PDF bytes
- If `kind='asset'`: load asset bytes; if mime is `application/pdf`, use directly; if image, wrap in a single-page PDF via pdf-lib
- If mime is neither PDF nor image, skip (or generate a placeholder page with the filename)

Concatenate all page trees with pdf-lib, return merged buffer.

### UI
- Application detail → new **"Merge documents"** action in the Documents card dropdown
- Opens a modal: checkbox list of all documents + assets for this application (or globally)
- Order-reorderable via drag handles
- Preview: shows the ordered list; on confirm, calls merge route → downloads
- Optionally saves the merged PDF as a new documents row (`kind='merged_pdf'`) so it appears in the library

Also a standalone `/documents/merge` page for ad-hoc merges (pick from any documents, not application-scoped).

### Documents library
- Extend filter chips with "Merged" chip
- Row action: Download (dispatch route already handles it via kind lookup)

### Testing
- Unit test `mergePdfs` with fixtures (small hand-crafted PDFs from pdf-lib for reproducibility)
- Integration test the route handler

---

## Success criteria

**Expenses:**
- Log an expense in <10 sec via quick-add
- Set a budget cap per category
- See monthly breakdown on `/expenses` + on `/analytics`
- Export as CSV

**PDF merger:**
- Select CV + cover letter + 2 certificates → download merged PDF in <15s
- Merged PDF is a valid single file that opens in any reader
- Save merged doc appears in library, downloadable again later
