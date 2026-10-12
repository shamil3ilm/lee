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
| Skills | 0…35 | Weighted overlap of the JD's skills with ready skills: must-have 2, mentioned 1, nice-to-have ½. Full credit for the skill or a concept it satisfies (Laravel for "a PHP framework", Looker for "a BI tool"); half for a close sibling (MySQL for PostgreSQL, Tableau for Power BI). Alternatives in one line ("Power BI or Tableau", "AWS/Azure/GCP", "PHP/Laravel or Go") are one requirement, met by any member and missing as one ("Power BI or Tableau (required)"). No recognisable stack: 18 for a tech role, 0 otherwise. |
| Responsibilities | 0…10 | Share of JD duties that name a ready skill or share two content words with a ready highlight. |
| Role | 0…10 | The JD's role family vs your targets; the title only nudges. Title and JD agree 10; the JD reads as a target under an unusual title 8 ("new title"); a generic title ("Software Engineer") 7, but 3 when its JD reads only as another family; title says a target but the JD reads another family 3; another family 3; not a tech role 0. A recognised non-engineering title (Category Executive, Operations Associate, Product Designer, Dean, Mandoub) is never "general software engineering" and gets no neutral skills points. JD families need real evidence: SQL alone is not backend, and Excel / KPIs / reports / dashboards need a real analytics tool (Power BI, Tableau, Looker, pandas…) to read as data analysis. |
| Seniority | 0…15 | Title level and years asked vs your levels and years (years read overall or per must-have line: "2+ years as a data analyst", "1–3 years in Laravel"); with both, the stricter read wins. Within a year of the ask is full; below that, 15 × (yours ÷ asked)^1.5 (2 years for "5+" earns 4). A stretch in a strong ready area (payments, ZATCA, Laravel, integrations, data) recovers up to 3, but not when the posting asks at least twice your years or the role is not one you target. |
| Region | 0…10 | Matched through the region hierarchy (`lib/regions`: GCC includes every Gulf city, Kerala includes Kochi, Trivandrum and Kozhikode). On-site in your regions 10, broader than your selection ("India" for a Kerala-only search) 7, relocation offered elsewhere 6; remote where you live 10, hours within ±4 h 9 (only an explicit window such as "UTC+4 to +8" with no place named), worldwide 8, unclear 5, restricted elsewhere 0. Places named as a remote role's location are where you must live: "Indonesia, Philippines, Thailand or Vietnam \| Remote" is restricted elsewhere even though those hours sit near India's. "Southeast/East/Central Asia" never covers India or the Gulf ("Asia" does). |
| Work mode | 0…5 | Remote / hybrid / on-site vs your preference. |
| Pay | −5…+5 | Stated pay vs your floor for that region (GCC pegs). |
| Language | −25…+3 | A language required at a level you do not have is −10 and a missing must-have; a MANDATORY one ("Arabic fluency required", "must be fluent in Arabic", "native Arabic speaker") is −25 and caps the Fit at 34 (weak). |
| Visa | −15…+5 | GCC: visa offered +5 (also benefit-list wording: "employment visa, medical and air ticket provided", "visa + accommodation", "company visa", "iqama provided", "transferable iqama not required"; never when the sentence says it is not provided), nationals preferred −5, nationals only −15; a local-hire posting (BambooHR "Admin Staff (Local)") where you need sponsorship and are not based −4 ("Local hire: likely needs Kuwait residency", m6). |
| Domain | 0…+10 | Payments and e-invoicing/ZATCA with ready evidence, +5 each, for a role you target. A tech role outside your targets at a payments company gets +2 ("Domain: payments company, but the role is Frontend"), a non-tech role 0. Employer boilerplate ("About us", "Who we are", benefits, perks, EEO) is stripped first, so a super app's "payments through our wallet" paragraph earns nothing. |

**Role relevance scales the context.** Seniority, region, work mode and
visa count in full only for a role you target (role 7+), half for another
tech family ("… (counts half: role outside your targets)") and not at all
for a non-tech role, so a Category Executive in Dubai cannot collect ~40
points for being in Dubai. Penalties are never scaled.

The sum is clamped to 0–100, then to the detail's **ceiling** when it has
one (the lowest applies):

| Ceiling | Score | Reason shown |
|---|---|---|
| Not a tech role | 25 | "Capped at 25: Category Executive is not a tech role" |
| Not eligible | 30 | remote only for countries you do not accept, US hours only, hours far from yours, or on-site elsewhere with no relocation you accept: "Capped at 30: remote only for Indonesia, Philippines, Thailand or Vietnam (not open to you)" |
| Mandatory language unmet | 34 | "Capped at 34: Arabic required, which you don't speak well yet" |
| Tech role outside your targets | 45 | "Capped at 45: Frontend is outside your target roles" |
| Title only | 55 | the low-confidence note |

The ceiling also holds the Match / AI blend and the employer-growth nudge
down, so a high AI score never lifts a posting out of its band, and it
applies to filtered rows the user restores with "Show anyway" too. Rules
version `m5`: bumping it re-scores stored rows on the next Discovery view,
after any profile save and in the daily shortlist job.

"Why this score" lists each component, every
must-have and nice-to-have as met / partial / missing with the profile line
that backs it, and the missing must-haves ("Kubernetes (required)",
"Arabic fluency (required)").

A posting with no usable JD (email alerts, Google Alerts, watch links) is
marked **Low confidence: title only** and capped at 55; "Fetch the full JD" (Greenhouse and
Lever public APIs) or "Paste the JD to score properly" stores the JD and
re-scores the row.

The same parsed JD picks the **best résumé variant** per posting ("Best CV",
`lib/cv-fit`, see [resume-and-portfolio.md](resume-and-portfolio.md#best-cv-for-each-job-libcv-fit))
and drives "Tailor to this JD".

### Ranking with the AI score

The AI score stays optional (prompt `score-job` 1.2.0: it is told where
you live and to score a role you cannot take 30 or lower; the industry
bonus needs the role's own work to be in your domain; an AI "mismatch" is
capped at 30 for remote roles too). One ranked number (`lib/discovery/match/blend.ts`,
SQL twin `blendedSql`):

- Match only → Match
- AI only → AI
- both → round(0.5 × Match + 0.5 × AI)

**The displayed Fit** is that blend plus the optional employer-growth nudge,
kept within 0–100 and still under the ceiling: `shownFit` on the card and
in "Why this score", `displayedFitSql` everywhere else. The "Best fit" sort
(the default), the minimum-Fit filter, new-discovery notifications, the
weekly digest's top discoveries and the shortlist all read this one number
(notifications and the digest used the AI score alone before).
"Combined (Fit + benefits)" is hidden: no source extracts benefits yet, so
it was Fit × 0.6 + 0; old `?sort=combined` links sort by Fit.

Location counts once, in the Fit: the AI score has no region or
e-invoicing bonus, and the shortlist's region and starred-region chips are
labels at 0 points. The daily shortlist uses 0.5 × the displayed Fit.

### Calibration

`tests/eval/calibration-cases.ts` holds about 150 synthetic postings
(on-target GCC / India / remote, stretch, adjacent tech, 30 non-tech GCC
traps in the style of ride-hailing and delivery companies, 10 boilerplate
traps, 20 eligibility traps, title-only alerts, university IT and academic
roles), each labelled with the bands it may land in. They run against two
synthetic profiles (backend + payments with Excel/SQL/Power BI and starred
UAE/Kuwait; backend only). `pnpm eval` and `pnpm test` fail when the
non-tech false-pass rate (non-tech postings in New at Fit 35+) is above
5 %, band agreement is below 80 % or an eligibility trap reaches New.
`pnpm tsx scripts/calibration-report.ts -v` prints every case. On
2026-10-12: before this work 84.3 % agreement, 43.0 % non-tech false-pass,
80 % eligibility recall; after it 100 %, 0 %, 100 % (the labels and the
fixes come from the same review, so treat this as a regression net, not
proof of real-world precision).

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
  An Operations/Business field covers GCC platform titles (operations
  associate, category executive/manager, account manager, training &
  quality, strategy & transformation, partner success, merchandiser,
  customer care, fleet / supply operations); Dean and Mandoub are teaching
  and admin titles. Generic skills (Git, REST, SQL, Excel, JavaScript, HTML,
  CSS, dashboards) count half toward "your skills in the posting", so they
  cannot outweigh a field's title.
- **Needs a look**: a recognised non-engineering title whose JD shows no
  tech family is neither filtered (no positive evidence of another field)
  nor shown in New: it stays `new` with `relevance_notes.needsLook` and is
  listed under "Needs a look (n)" (a status option and a link under the New
  list). New, the board, notifications, the digest and the shortlist leave
  it out. University IT roles (Application Developer, Web Developer, an
  Institutional Research Officer whose JD names SQL and Power BI) still
  reach New. Relevance rules version `r9`.
- **Learned titles**: "Show anyway" and saving an uncertain posting teach
  lee the title as related; "Not for me → Not my field" as unrelated.
  Editable in Search preferences. A weekly "Did we filter something
  useful?" list (Filtered tab and digest) restores and teaches in one click.
- **Seniority** (soft): Senior / Lead / Staff titles and years asks rank
  lower; Principal, Director, Head of, VP and a 10+ year Architect are
  filtered.
- **Nationals only** (hard): Emiratisation, Saudization and other
  nationals-only roles are skipped; "nationals preferred" ranks lower. The
  phrase must be about candidates ("Saudi nationals only", "for Kuwaiti
  nationals", "Emirati candidates only"); employer and proper names
  ("Saudi National Bank", "UAE national carriers") never count.
- **Remote from home**: worldwide, APAC/EMEA, where you live, or (with no
  place named) an explicit working-hours window within ±4 h pass; a remote
  location naming only other countries, US-only, residency ("must be based
  in", "open to candidates located in", "open to residents of"),
  right-to-work and US-hours-only are filtered; a bare "Remote" gets an
  "unclear eligibility" chip.
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
