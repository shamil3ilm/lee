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
- the section order, length target (1 or 2 pages) and template (`ats`, `brand` or `classic`)
- the region-field toggles
- explicit overrides for not-ready `ai_assisted` items, which are shown with "You may be asked about this in an interview"

**Presets.** Region presets: GCC turns on nationality, visa, notice and languages. India has no photo, and its CTC toggle is off. Remote / US / EU never shows a photo, date of birth or marital status. Role presets come from the accepted role families and only pick interview-ready items.

**Versions.** Each save that changes the recipe adds a version. An application records the variant and version it used (`applications.resume_variant_id` and `resume_variant_version`), and tailoring starts from that version (`tailor-cv` prompt 1.1.0).

**Cleanup.** The nightly retention run prunes old versions (`variantVersions` step, `lib/db/retention/variants.ts`). The window is per user in Settings › Storage ("Old résumé variant versions", default 180 days, 30–1825). It never deletes:

- the latest version of a variant;
- any version an application records;
- any version that was published to the portfolio (`resume_variant_versions.published_at`, set on publish and never cleared).

It runs in bounded batches inside the run's time budget and is idempotent. The per-version `latex_cv` documents are documents, so they are not touched.

**Templates** (`lib/variants/latex.ts`). All three take the same fact-locked `RenderedResume` and escape every string (`lib/latex/escape.ts`, one pass, so text like "BSc" is never mangled):

- `ats`: single column, no colour, no icons; parses cleanly.
- `brand`: the same structure in the lee brand colours.
- **Paper size** is per variant (`recipe.paper`, the Recipe card's **Paper** select). Left at the region default it is A4 for GCC and India and US Letter for Remote / US (`REGION_PAPER`, `paperFor` in `lib/variants/types.ts`); every template honours it.
- `classic` (`latex-classic.ts`, layout in `lib/latex/classic-layout.ts`): a RenderCV-style layout. It uses article 10pt with 2 cm margins and Charter, on the variant's paper size. Section headings are titlesec, in caps, over a full-width rule. Each entry is a `twocolentry` (paracol) with the title and employer on the left and italic dates right-aligned in a 4.5 cm column, followed by a tight `highlights` list. The name is in 22pt bold caps at the top left, with the headline in bold and two contact lines (facts, then links) below. Education and certificate dates go to the right column. Links reach `\href` only when their URL is safe (`hrefUrl`); otherwise they are printed as text. It uses standard packages only, so it compiles on latexonline.cc with no fallback. It drops `fontawesome5` (unused) and `eso-pic` (no footer). The editor gallery has the same layout as the **Classic** template (`templates/cv-classic.tex`), and a unit test keeps the two preambles identical. See [latex-compile.md](latex-compile.md) for the side-by-side layout check.

**Outputs.** All outputs reuse existing pipelines:

- A `latex_cv` document per variant version gives the PDF, the LaTeX editor and the PDF cache.
- **Make PDF** has two steps, each visible in the panel. *Preparing* writes the document (server action, database only). *Compiling* fetches `/api/documents/[id]/pdf`, which compiles through the PDF cache, and shows elapsed seconds and a Cancel button. The result is *PDF ready* with Download and editor links, or a failure: "not answering" (route 503, Retry-After 30) and "took too long" (the browser's 75 s deadline) offer **Try again**; a LaTeX error (422) links to the editor for the log. No database transaction is open during the compile (`components/variants/use-variant-pdf.ts`, `lib/variants/pdf-client.ts`).
- The PDF can be saved to Drive in lee/CVs.
- "Score this variant" goes through CV Score's public `scoreCv`.
- A plain-text export is available for portal forms.

### Photo (`lib/resume/photo.ts`, `photo-store.ts`)

The profile photo is uploaded in Settings › Profile › Résumé and is **private**: it is never published (the portfolio mapper never writes it, whatever `basics.image` says).

- **Validate.** The browser accepts JPEG, PNG or WebP up to 2 MB, then square-crops the centre and downscales it to 512 px on a canvas and uploads a JPEG. lee has no server-side image library (sharp isn't a dependency), and pdflatex can't read WebP. `POST /api/profile/photo` re-checks the bytes themselves: the type sniffed from the header (JPEG or PNG only), at most 2 MB, square, 64 to 1024 px.
- **Store.** The photo is a document asset (`lee-photo.jpg` or `.png`) on a hidden holder document of kind `profile_photo`, one per user. It goes through the existing asset store, so it lands in Drive when Drive is connected and in Postgres otherwise. `documents.list` leaves the holder out of the library.
- **Place.** A variant places the photo when its Photo field is on, its region allows it, and a photo exists. Remote / US / EU and India never allow it (`LOCKED_OFF`), and GCC has it off by default. `ensureVariantDocument` then copies the photo into the variant's `latex_cv` document as an asset (same sha256, so the copy is refreshed only when the photo changes). It is removed again when the variant stops placing it.
- **Compile.** `ats` and `brand` add `graphicx` and set the name block beside a 2.6 cm photo: plain in `ats`, framed in the brand colour in `brand`. `classic` puts a 2.5 cm photo at the top right and narrows the name block to 78% of the width. Without a photo, the header takes the full width. The existing pipeline packs the image into the latexonline.cc tarball, and its sha is part of the PDF cache key. Only lee's own file names are ever embedded in the source.
- **Warn.** The variant preview warns when Photo is on but no photo is uploaded.

## Starter CV set (`lib/variants/starter.ts`)

Settings › Variants offers a starter set built from the role families the user **accepted** in Search preferences. Nothing is created automatically: the user ticks the role × region combinations they want and clicks **Create selected**.

| Starter | Accepted families that offer it | Built for |
|---|---|---|
| Payments / Backend | payments, backend, API / integration | payments |
| Full-stack TypeScript | full-stack, frontend | full-stack |
| Data Analyst / BI | data analyst, analytics engineer, data | data analyst |
| Business / Systems Analyst | business analyst, implementation, solutions | business analyst |
| ERP / E-invoicing | ERP, e-invoicing | e-invoicing |

An accepted family no starter covers gets its own row. Each row offers GCC, India and Remote; a combination that already exists (same region and role family) is shown as created.

Each recipe only picks and orders **ready** items and **approved** wordings:

- interview-ready items (the role preset), in the master text or an approved alternate that speaks the role's language better;
- ERP / E-invoicing also adds domain-ready items, but only in their design or domain wording (number lock + domain lock); a design-only item with no such wording is left out.

## Best CV for each job (`lib/cv-fit`)

For every in-play discovery (new, shortlisted, saved) and every application, each of the user's variants is scored on what it **renders** against the job's **parsed JD** (`lib/discovery/match/jd.ts`). Deterministic, no AI, no network.

| Part | Points | Rule |
|---|---|---|
| Requirement coverage | 0…60 | Every must-have and nice-to-have line, checked with the Match Score's line check: met 1, partial ½, missing 0, weighted must 2 · nice ½. "Not checked" lines are left out. A JD with no checkable line falls back to its skills (required 2 · mentioned 1 · nice ½). |
| Responsibilities | 0…20 | The Match Score's responsibilities overlap × 2. |
| Region | 0…15 | Variant region is one of the job's 15; job region not stated 9; Remote variant for a GCC or India job 6; GCC or India variant for a remote job 4; GCC vs India 0. A job in the US, Canada, the UK, Ireland, Europe or Australia reads as Remote. |
| Quality | 0…5 | The variant's CV Score (general mode, `computeCvScore`) ÷ 20. |

What a variant shows is what counts: skills come from fully presented lines (bullets, the skills line, project stacks), never from design-only bullets, which back a requirement only through content-word overlap (partial). Job keywords the résumé never prints do not count.

**Best and runner-up.** Highest fit; ties go to the higher CV Score, then the variant built for the job's role family (a starter serves its whole family group), then the name. The reasons say what decided it ("Covers 5 of 6 must-haves", "GCC variant for a GCC job", "Only this one shows: …"; the runner-up gets "Misses: …").

**Storage.** `best_cv` (jsonb, ≈ 0.5–1 KB: variant id, version, name, region, fit, must-have counts and reasons for the best and the runner-up) and `best_cv_key` on `discoveries` and `applications`. The key is the rules version (`BEST_CV_VERSION`) + a fingerprint of the master profile + the live variants (id, version, name, region). Applications add a hash of their JD, because a job is editable; on discoveries a pasted or fetched JD clears the key.

**Recompute.** The `discovery-match:user` job recomputes stale in-play discoveries in batches after the Match Score backfill, queued after any résumé, profile or variant save. The shortlist, the Discovery list, a discovery's page and an application fill their own rows on read when stale. Rendering happens only when something is stale, so the steady state costs one query. Retention clears `best_cv` when a dismissed discovery is tombstoned.

**Where.** Shortlist cards, the discovery "Why this score" popover (a bottom sheet on phones), the discovery page, the application page (Résumé variant card) and Prepare step 1: "Best CV: Data Analyst · GCC (fit 78) · runner-up Payments · GCC (71)" with **Use this CV** (on a discovery it starts Prepare with that variant).

**Bulk view.** Settings › Variants shows the open postings (best Match Score first, up to 20) × variants with each fit, which variant is best for how many, and the **top recurring missing must-haves this month** (from the Match Score's missing list, at least 2 postings) as study suggestions with Playground skills.

## Tailor to this JD (`lib/cv-fit/tailor`)

Prepare step 2 and the application page. It starts from the application's variant version (or a master preset when none is chosen).

**Requirement checklist.** Every must-have and nice-to-have of the parsed JD, met / partial / missing against the profile's **ready units** (interview-ready items in any fact-locked wording, domain-ready items in design wording, backed skills), with the unit that backs it and whether this CV already shows it.

**Suggestions,** each accepted or rejected on its own; nothing changes until **Save tailored copy**:

| Kind | When | Safeguard |
|---|---|---|
| Include a ready item | A ready unit backs a met or partial requirement but is not on this CV; for a partial, the related ready skill (MySQL ≈ PostgreSQL). | Only presentable units exist; render re-applies readiness. |
| Lead with the evidence | The evidence bullet is not first in its job or project. | Reorder only. |
| Reorder skills | Skills the JD asks for are not first. | Reorder only. |
| Use an approved wording | An alternate of the same highlight uses more of the JD's terms. | Only stored alternates that pass the number lock (and the domain lock for design-only items). |
| New wording (pending) | Optional AI: bullets backing met requirements, re-worded in the JD's terms. | Signal-gated. Refused unless every number is in the master highlight, a design-only item makes no implementation claim ("built", "implemented", …) and it uses more JD terms. Accepted wordings join the master highlight as approved alternates (source "ai") only on Save, through the profile's own validation. Client copies are re-locked on the server. |
| Headline / Summary | JD keywords that fully ready evidence supports and the text does not name yet. | The user's own headline and summary plus those keywords only; number lock against the whole profile, domain lock. Never a partial or design-only keyword. |
| Trim to the page target | The tailored CV runs over the region's page target. | Removes only: the lowest-relevance bullets that back no requirement, then unasked skills; a job keeps one bullet. Target: the variant's length in the GCC and India, one page for Remote under five years. |

**Missing requirements are never added.** They are gaps with three options: **Add to study list** (a learning skill in the profile, never shown on a CV, mapped to the Playground skills it matches), **Mention adjacent experience in the cover letter** (offered only when a ready unit shares the skill family or two content words, with that source shown) or ignore. A property test checks over random profiles and JDs that every missing requirement is still missing on the tailored CV and that every printed line is presentable profile content.

**Before / after.** Must-have coverage on the CV, the CV Score for this JD (deterministic, no AI) before → after, the page estimate and a side-by-side diff (added, removed, moved).

**Save.** A `tailored_cv` document linked to the application plus a `cv_tailorings` row: the JD hash, the base variant and version, every accepted suggestion, the gap decisions and the checklist. Prepare step 2 is marked done with the CV Score delta. The cover-letter prompt (1.2.0) reads the same checklist and the adjacent evidence the user chose, never claims a missing requirement and mentions adjacent work only as adjacent.

## Photo advice (`lib/cv-fit/photo`)

"Photo: Recommended / Optional / Avoid" with the reasons, on Prepare step 1 and the application's variant picker. Explicit posting text decides first: "do not include photos" / "no photo" → Avoid; "attach photo", "passport-size photo(graph)", "recent photograph" → Recommended. Otherwise the factors add up (≥ +2 Recommended, ≤ −2 Avoid, else Optional):

| Factor | Effect |
|---|---|
| Country (location and title) | UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman +1 · Germany, Austria, Switzerland 0 · other Europe −1 · remote −1 · India −2 (not needed) · US, UK, Canada, Australia / NZ, Ireland, the Netherlands −4 |
| Employer type | Watch-list government or semi-government sectors +2 · banks and airlines +1 · startups, fintech, global tech −1. The positive leans count only in the GCC (or when the country is not stated). Names ("… Authority", "Ministry …", "… Bank", "… Airways") count when the employer is not on the watch list. |
| Application channel | ATS form (Greenhouse, Lever, Workday, …) −1 · email to a recruiter +1 in the GCC |
| Posting | An equal-opportunity statement −3 |

The variant's region rules still apply: Remote / US / EU and India never show a photo. When the advice is Recommended and a photo is uploaded, **Use the photo version** switches to the best-fitting GCC variant with Photo on, or creates one ("… · Photo") from the best GCC variant. Without a photo it links to Settings › Résumé with guidance: a recent, professional head-and-shoulders shot on a plain background. When the advice is Avoid and the chosen variant shows the photo, it says so.

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

## Variant pages on the portfolio (`lib/portfolio/variant-*.ts`)

Each variant has a "Publish this variant to the portfolio too" toggle, **off by default**. Turning it on gives the variant a page address (`portfolio_slug`). The address is derived from the name, unique per user, and editable until the variant is published.

1. **Map.** `variant-map.ts` applies the recipe to the master profile: only the included items, highlights and skills, in the variant's order and chosen wordings, under the same readiness rules as the PDF. The result goes through the same `toJsonResume` as profile.json, so only public fields are written. On top of that:
   - phone and location appear only when the variant shows them;
   - the photo never appears;
   - a domain-only project is left out, because the page lists its stack;
   - an item left with no presentable highlight is left out.

   `basics.label` and `basics.summary` are the variant's headline and summary. `meta.canonical` is `<portfolio origin>/variants/<slug>.json`.
2. **Validate and write.** Validation, sha and conflict handling, and the 409/422 re-fetch work as for profile.json. The file is `variants/<slug>.json` next to profile.json, and the commit is "chore(profile): sync variant <slug> from lee" with a summary.
   - A variant holds no facts, so a hand edit can't be taken back into lee. The conflict shows which sections differ, and the user can only overwrite the file with lee's version (against the sha they saw).
3. **Record.** The sha, hash, version, commit URL and time are stored on `resume_variants.portfolio_*`. The published recipe version gets `published_at`. The events `variant_published` and `variant_publish_conflict` are logged without the token or the content.
4. **Unpublish.** Unpublish asks for confirmation, then deletes the file through the contents API ("chore(profile): remove variant <slug> (lee)") and turns the toggle off. Turning the toggle off on a published variant goes through the same confirmation, and a published variant's address can't change until it is unpublished.

Settings › Profile › Publish lists the enabled variants (and any still on the portfolio, archived ones included) with Publish, Unpublish, the last commit and the **public URL**, `<portfolio origin>/resume/<slug>.html`. The variant editor shows the same URL.

The portfolio repo's build (`scripts/build-resume.mjs`) validates every `variants/*.json` with the same schema, checks the canonical against the file name, and renders `resume/<slug>.html` from the résumé template. The page has a "Tailored résumé" label, a canonical link and `noindex`. The build also deletes the page of a removed variant. Its Regenerate pages workflow watches `variants/**`.
