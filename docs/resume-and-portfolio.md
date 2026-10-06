# Résumé facts, variants and portfolio publishing

## One source of facts

The **master profile** (`user_profile.resume`, schema in `lib/resume/types.ts`) is the only place résumé facts are edited: Settings › Profile › Résumé.

- Every work item, project, skill, highlight and wording has a stable id.
- Every field has a public/private flag (`visibility`; defaults in `lib/resume/visibility.ts`). Public by default: name, label, email, website, summary, country, links, work, projects, skills, education, languages, certificates. Private by default: phone, location detail, photo, nationality, visa status, notice period, expected salary, date of birth, marital status. Search preferences live in other columns and are never exported.
- Projects, highlights and skills also carry **private** readiness: `depth` (`own` | `ai_assisted` | `learning`), `interviewReady` (can explain the implementation), `domainReady` (owns the idea and domain design), `ownedAspects`, and study notes and a target date. Both flags default to true for `own` and to false otherwise.

### The master CV is derived

The direction is one-way: **profile → MasterCV**.

- `lib/resume/derive.ts` builds the MasterCV every consumer already reads: tailoring, cover letters, outreach, prep, CV Score, LaTeX and PDF.
- Every profile save writes a new `master_cv` document version when the derived CV changes. This keeps history, staleness checks and the documents library working.
- The derived CV contains only presentable items. That means interview-ready ones, plus domain-ready ones in a design wording without stack keywords. So no AI prompt built from it can pick a not-ready item, and role suggestions ignore evidence that only not-ready items carry.

### Migration

A user with only a legacy `master_cv` document gets a profile built from it on first load (`lib/resume/legacy.ts`, saved once). Every migrated item is marked `own`, because it is the CV the user wrote.

`saveMasterCV` still exists for CV Score autofix. It merges the edited MasterCV back onto the profile (`lib/resume/merge-cv.ts`) and keeps ids, flags and every item the CV never showed. The old Settings › CV editor redirects to Résumé.

## Fact lock (`lib/resume/fact-lock.ts`)

- **Number lock.** A wording is an alternate phrasing of one master highlight. Every number in it must also appear in that highlight: "1,200" equals "1200", "2M" does not equal "2", and "three" equals "3". New wordings that break this are refused on save. A master edit that breaks an existing wording only marks it stale: variants fall back to the master text.
- **Domain lock.** A domain-ready-only item is shown only in a wording with no implementation claims ("built", "implemented", "coded", "shipped", …).
- **AI output.** AI proposals and tailored CVs pass both locks in code (`lib/variants/proposals.ts`, `lib/variants/tailor-lock.ts`).

## Variants (`lib/variants`)

A variant is a versioned **recipe**. It holds no facts, only:

- which items and highlights are included, and their order
- the wording chosen for each highlight
- the headline and summary
- the section order, length target (1 or 2 pages) and template (`ats` or `brand`)
- the region-field toggles
- explicit overrides for not-ready `ai_assisted` items, which are shown with "You may be asked about this in an interview"

**Presets.** Region presets: GCC turns on nationality, visa, notice and languages. India has no photo, and its CTC toggle is off. Remote / US / EU never shows a photo, date of birth or marital status. Role presets come from the accepted role families and only pick interview-ready items.

**Versions.** Each save that changes the recipe adds a version. An application records the variant and version it used (`applications.resume_variant_id` and `resume_variant_version`), and tailoring starts from that version (`tailor-cv` prompt 1.1.0).

**Outputs.** All outputs reuse existing pipelines:

- A `latex_cv` document per variant version gives the PDF, the LaTeX editor and the PDF cache.
- The PDF can be saved to Drive in lee/CVs.
- "Score this variant" goes through CV Score's public `scoreCv`.
- A plain-text export is available for portal forms.

## Publish to portfolio (`lib/portfolio`)

`profile.json` is JSON Resume v1.2.1 plus `meta.x-portfolio`, in the format described in the portfolio repo's README ("lee sync").

1. **Map.** Only public fields are mapped (`map.ts`). Depth and readiness are never written.
2. **Validate.** The file is validated with a TypeScript port of the portfolio's own validator and schema (`validate.ts`, `checks.ts`, `profile.schema.json`). `tests/unit/portfolio-validate-parity.test.ts` runs the original JavaScript validator (vendored in `tests/fixtures/portfolio`) against more than 600 generated documents and requires identical errors. A file with errors is never sent.
3. **Fetch.** A GET returns the file's sha. If the sha differs from `portfolio_publish.last_sha`, the file was edited by hand: lee shows a field-level diff per section, and the user keeps lee's side or takes the repo's, per section or wholesale. Taking the repo's side writes it into the master profile, so lee stays the source.
4. **Write.** A PUT sends that sha with "chore(profile): sync from lee" and a summary. A 409 or 422 means the file changed in between: lee re-fetches it and shows the new diff.
5. **Record.** The sha, content hash, version and commit URL are stored. The events `profile_published` and `profile_publish_conflict` are logged without the token or the file content.

The token is the `github_portfolio` entry in the encrypted key store. Its Test does four checks:

- the token is fine-grained;
- the repository is readable;
- the file is readable;
- write access works, checked with a PUT that carries a deliberately wrong sha, so nothing is ever committed.

## Not built yet

- **Variant pages on the portfolio.** The per-variant "publish to portfolio" toggle and `portfolio_slug` are stored, but nothing renders them on the portfolio yet.
- **Photo in PDFs.** The photo toggle exists, but the LaTeX templates don't place a photo.
