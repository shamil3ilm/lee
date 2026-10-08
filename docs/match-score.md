# Match Score and relevance

How lee decides what Discovery keeps and how it ranks it. Everything here is
deterministic and free: no AI call, no network (except the user-initiated
"Fetch the full JD"). Code: `lib/discovery/match` and `lib/discovery/relevance`.

## Match Score (0–100)

Computed for every discovery at ingest (filtered ones too) and stored in
`discoveries.fit_score`, with the explanation in `fit_detail` and the rules
version + profile fingerprint in `fit_key`. A batched queue job
(`discovery-match:user`), the Discovery page and the daily shortlist job
re-score rows whose key is out of date.

The score compares the **full job description** with the profile's **ready
evidence only** (interview-ready items, and domain-ready items in domain
wording; learning and AI-assisted items never count). The JD is parsed into
responsibilities, must-haves and nice-to-haves, years per line, stack,
domains, education, certifications, languages, work authorisation and
shifts (`lib/discovery/match/jd.ts`).

| Component | Points | Rule |
|---|---|---|
| Skills | 0…35 | Weighted overlap of the JD's skills with ready skills: must-have 2, mentioned 1, nice-to-have ½. Full credit for the skill or a concept it satisfies (Laravel for "a PHP framework", Looker for "a BI tool"); half for a close sibling (MySQL for PostgreSQL, Tableau for Power BI). No recognisable stack: 18 for a tech role, 0 otherwise. |
| Responsibilities | 0…10 | Share of JD duties that name a ready skill or share two content words with a ready highlight. |
| Role | 0…10 | The JD's role family vs your targets; the title only nudges. Title and JD agree 10; the JD reads as a target under an unusual title 8 ("new title"); title says a target but the JD reads another family 3. |
| Seniority | 0…15 | Title level and years asked vs your levels and years; a stretch in a strong ready area (payments, ZATCA, Laravel, integrations, data) recovers half. |
| Region | 0…10 | On-site in your regions 10, relocation offered elsewhere 6; remote where you live 10, hours within ±4 h 9, worldwide 8, unclear 5, restricted elsewhere 0. |
| Work mode | 0…5 | Remote / hybrid / on-site vs your preference. |
| Pay | −5…+5 | Stated pay vs your floor for that region (GCC pegs). |
| Language | −10…+3 | A language required at a level you do not have is −10 and a missing must-have. |
| Visa | −15…+5 | GCC: visa offered +5, nationals preferred −5, nationals only −15. |
| Domain | 0…+10 | Payments and e-invoicing/ZATCA with ready evidence, +5 each. |

The sum is clamped to 0–100. "Why this score" lists each component, every
must-have and nice-to-have as met / partial / missing with the profile line
that backs it, and the missing must-haves ("Kubernetes (required)",
"Arabic fluency (required)").

A posting with no usable JD (email alerts, Google Alerts, watch links) is
marked **Low confidence: title only**; "Fetch the full JD" (Greenhouse and
Lever public APIs) or "Paste the JD to score properly" stores the JD and
re-scores the row.

The same parsed JD picks the **best résumé variant** per posting ("Best CV",
`lib/cv-fit`, see [resume-and-portfolio.md](resume-and-portfolio.md#best-cv-for-each-job-libcv-fit))
and drives "Tailor to this JD".

### Ranking with the AI score

The AI score stays optional. One ranked number (`lib/discovery/match/blend.ts`,
SQL twin `blendedSql`):

- Match only → Match
- AI only → AI
- both → round(0.5 × Match + 0.5 × AI)

The "Best match" sort and Combined sort use it; the minimum-match filter reads
the Match Score. The daily shortlist uses 0.5 × the ranked number (instead of
the old flat 25 for postings the AI never scored).

## Relevance rules (what is filtered)

Only clear mismatches are filtered, always with the reason. Defaults
(each rule is switchable in Search preferences):

- **Domain** (hard): postings in an unrelated field — marketing, HR, legal,
  sales, accounting/audit, admin, healthcare, teaching, hospitality, trades,
  product/design, customer service, project/operations, gig work — filtered
  only on positive evidence in the title or JD **and** at most one of your
  ready skills in the posting. Tech roles in those fields stay (MarTech,
  HRIS, fintech). An unknown title is never filtered: a matching JD labels it
  "<family> · new title", mixed or weak evidence gives "Uncertain fit —
  review". Runs before search preferences are saved, on families inferred
  from ready evidence (a banner on Discovery and the Shortlist says so).
- **Learned titles**: "Show anyway" and saving an uncertain posting teach
  lee the title as related; "Not for me → Not my field" as unrelated.
  Editable in Search preferences. A weekly "Did we filter something
  useful?" list (Filtered tab and digest) restores and teaches in one click.
- **Seniority** (soft): Senior / Lead / Staff titles and years asks rank
  lower; Principal, Director, Head of, VP and a 10+ year Architect are
  filtered.
- **Nationals only** (hard): Emiratisation, Saudization and other
  nationals-only roles are skipped; "nationals preferred" ranks lower.
- **Remote from home**: worldwide, APAC/EMEA, where you live, or working
  hours within ±4 h pass; US-only, residency, right-to-work and US-hours-only
  are filtered; a bare "Remote" gets an "unclear eligibility" chip.
- **Relocation if sponsored** (on by default, optional country list): an
  on-site posting outside your regions passes when it offers relocation or
  visa sponsorship ("Relocation offered · Berlin").

RemoteOK sample (99 postings from 2026-09-27, `tests/fixtures/discovery`):
59 pass with no preferences (40 filtered by the domain rule); 16 pass for a
junior–mid backend / full-stack profile targeting the GCC and India, 7 of
them with an "Uncertain fit" chip (was 6 under the old hard title rules).

## Reset discoveries

Discovery's overflow menu and Settings › Storage. Removes new, filtered and
dismissed postings (optionally unacted shortlisted ones) for all or selected
sources; never saved jobs, applications or anything being prepared.
Dismissed tombstones are removed too so postings can be re-imported (unless
turned off). Optional fresh poll right away. Logged as `discoveries_reset`
(counts only).
