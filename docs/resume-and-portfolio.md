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
- `classic` (`latex-classic.ts`, layout in `lib/latex/classic-layout.ts`): a RenderCV-style layout. It uses article 10pt on letter paper with 2 cm margins and Charter. Section headings are titlesec, in caps, over a full-width rule. Each entry is a `twocolentry` (paracol) with the title and employer on the left and italic dates right-aligned in a 4.5 cm column, followed by a tight `highlights` list. The name is in 22pt bold caps at the top left, with the headline in bold and two contact lines (facts, then links) below. Education and certificate dates go to the right column. Links reach `\href` only when their URL is safe (`hrefUrl`); otherwise they are printed as text. It uses standard packages only, so it compiles on latexonline.cc with no fallback. It drops `fontawesome5` (unused) and `eso-pic` (no footer). The editor gallery has the same layout as the **Classic** template (`templates/cv-classic.tex`), and a unit test keeps the two preambles identical. See [latex-compile.md](latex-compile.md) for the side-by-side layout check.

**Outputs.** All outputs reuse existing pipelines:

- A `latex_cv` document per variant version gives the PDF, the LaTeX editor and the PDF cache.
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
