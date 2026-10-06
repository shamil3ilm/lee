/**
 * v1.1 — synthetic "tricky layout" CV: text as extracted from a 2-page PDF
 * with NO bullet glyphs. Every bullet wraps onto 2–3 lines, the company sits
 * on the line BELOW "Title <dates>", a non-engineering role overlaps the
 * internships, contact links are hyperlink text only, and Laravel appears
 * often (a normal Laravel CV, not stuffing). All names are invented.
 */

export const TRICKY_NOW = new Date('2026-10-06T00:00:00Z')

export const TRICKY_LINKS = [
  'mailto:riya.menon@example.com',
  'https://www.linkedin.com/in/riya-menon-example/',
  'https://github.com/riya-menon-example',
  'https://riyamenon.example.dev/',
]

export const TRICKY_LINES = [
  'Riya Menon', // 0
  'Software Engineer | Backend Systems | Payments', // 1
  'riya.menon@example.com | LinkedIn | GitHub | riyamenon.example.dev', // 2
  'PROFESSIONAL SUMMARY', // 3
  'Backend engineer working on payment workflows with Laravel, PHP, MySQL, REST APIs, queues and webhooks, with a focus on', // 4
  'reliability, authorization and production debugging.', // 5
  'PROFESSIONAL EXPERIENCE', // 6
  'Software Engineer    Dec 2025 – Present', // 7
  'Acme Pay, Kochi, India', // 8
  'Designed and implemented a delegated access layer across 450 existing REST endpoints, 7 payment', // 9
  'services, and 38 webhook event types, with audit trails and authorization controls for every approval', // 10
  'path.', // 11
  'Hardened multi-level payment approvals by re-validating 3 bank fields at release and restricting 3 edit', // 12
  'paths while payments were pending.', // 13
  'Reduced failed recurring-payment runs by 40% by blocking execution against deleted destinations across 5', // 14
  'payment types.', // 15
  'Built per-call cost and latency tracking for 16 AI features across 18 call sites, with a dashboard by', // 16
  'feature, model and provider account.', // 17
  'Extended payroll PDF processing to split merged files into per-check documents, and contributed to', // 18
  'automated column mapping for bulk payment imports.', // 19
  'Moved wallet-statement exports above 1,000 transactions to background Laravel jobs, saving support 6', // 20
  'hours a week.', // 21
  'PHP Laravel Intern    Jun 2025 – Nov 2025', // 22
  'Contoso Solutions, Dubai, UAE (Remote)', // 23
  'Analyzed a Laravel business platform serving customers in Qatar, Saudi Arabia and the', // 24
  'UAE, tracing routes, controllers, models, Blade views and database structures.', // 25
  'Rebuilt the invoicing module in Laravel, Vue and TypeScript, translating client requirements into', // 26
  'modular application workflows.', // 27
  'Implemented the e-invoicing XML signing and QR-code generation in Laravel up to handover.', // 28
  'Executive Manager    Jan 2024 – May 2025', // 29
  'Brightpath Academy, Kerala, India', // 30
  'Managed internal documentation, digital assets and financial records while keeping', // 31
  'administrative workflows organised.', // 32
  'Prepared salary and fee amounts and coordinated letterheads, receipts and posters for the', // 33
  'academy.', // 34
  'Web Developer Intern    Jun 2024 – Jul 2024', // 35
  'Fabrikam Robotics, Thrissur, India', // 36
  'Supported web development, usability improvements and testing for the training portal, including', // 37
  'session assistance and documentation of outcomes.', // 38
  'PROJECTS', // 39
  'Ledgerly – Small Business Ledger    Laravel, PHP, MySQL', // 40
  'Built a double-entry ledger with 12 report types and role-based access, covered by 140 feature', // 41
  'tests.', // 42
  'Rotawise – Shift Planner    Next.js, TypeScript, Supabase', // 43
  'Shipped a shift planner used daily by 25 colleagues, cutting rota preparation from 3 hours to 20', // 44
  'minutes a week.', // 45
  'TECHNICAL SKILLS', // 46
  'Languages: PHP, TypeScript, JavaScript, SQL', // 47
  'Backend: Laravel, REST APIs, Eloquent, Queues, Webhooks', // 48
  'Databases: MySQL, PostgreSQL', // 49
  'Tools: Git, Composer, Laravel Horizon, Laravel Sail', // 50
  'EDUCATION', // 51
  'B.Tech in Computer Science    2021 – 2025', // 52
  'Westbridge Institute of Technology', // 53
]

export const TRICKY_TEXT = TRICKY_LINES.join('\n')

/** The same text with each bullet starting with "• " — wrapped lines stay unmarked. */
export function trickyWithGlyphs(): string {
  const starts = new Set([9, 12, 14, 16, 18, 20, 24, 26, 28, 31, 33, 37, 41, 44])
  return TRICKY_LINES.map((l, i) => (starts.has(i) ? `• ${l}` : l)).join('\n')
}
