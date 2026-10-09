# Compare with my current job

lee compares every opportunity (a discovery or a saved application) with
the job you have now. It implements the criteria part of the v17 §6.6
Opportunity Score for this one question: "would this be better than what I
have?". Code: `lib/compare/`. Data: one private `job_comparison` row per
user (`lib/db/schema-compare.ts`).

## Rules this feature follows

- **Private by default.** The current job (pay, benefits, self-ratings,
  notes) lives in its own table, never on the master profile, so the
  portfolio mapping cannot publish it (tested in
  `tests/unit/compare-privacy.test.ts` and
  `tests/integration/job-comparison.test.ts`). Nothing in `lib/compare`
  logs values: saves log only the event name, and failures log only the
  error's type.
- **Deterministic first.** Every number is computed by rules from data you
  can see. The AI narrative is optional, on demand and confirmed by you.
- **Every value cites its source** and a confidence: *known* (stated by
  the posting, your current job, a currency peg), *estimated* (computed
  from your assumptions or inferred by a rule) or *unknown*.
- **Unknown is never zero.** An unknown criterion draws no bar, is left out
  of the weighted total (the total shows how much of it is known) and
  becomes a question to ask.
- **The job description, not the title.** Benefits, growth (scope,
  responsibilities, tech, team or leadership, learning), work-life (hours,
  shifts, on-call, travel, work mode) and pay are read from the full JD
  text (`lib/compare/jd.ts`, `lib/compare/benefits.ts`), and each signal
  quotes the JD line it came from. A description under 200 characters is
  "thin": those criteria show "Unknown (no description)" and the card
  offers **Paste the JD**. The pasted text is stored on the discovery
  (`discoveries.pasted_jd`, added in this migration as a minimal field; if
  the match-score branch lands its own pasted-JD field, point
  `lib/compare/service.ts` at it and drop this column). For an application,
  the card points to "Edit", which already holds the description.
- **Zero cost.** No paid API. FX rates come from you, or optionally from a
  free source you trigger (below).

## What you set (Settings › Profile › Current job)

| Setting | Used for |
|---|---|
| Employer, title, city | Your baseline; the title's level is compared with the posting's. "Use résumé" fills employer and title from the master profile's current work item (the one with no end date). |
| Country | Which tax and cost-of-living assumptions apply to you. |
| Work mode, start month | Work-life comparison; context. |
| Monthly gross pay + currency | The pay baseline. Leave it empty and pay stays unknown. |
| Benefits | Health insurance (none / just me / family), bonus, PF / gratuity, leave days, WFH, learning budget, housing, transport, annual flight, other. "Not sure" stays unknown. |
| Commute or relocation notes | Shown to you only. |
| Self-ratings 1–5 | Growth / learning, tech stack, manager / mentorship, work-life balance, job security, team / culture. |
| What I want more of | Up to three criteria that count double in the weighted total. |
| **FX table** | INR, EUR and GBP per US dollar, with the date you last changed it. GCC currencies need no rate. |
| **Tax and living costs per place** | Effective tax %, monthly housing and other living costs, in each place's own currency. |
| Shortlist factor | Off by default (below). |
| Expected yearly pay + **Share current and expected CTC in India applications** | Off by default. When on, cover letters and recruiter messages for Indian postings state "Current CTC ₹7.2 LPA · Expected CTC ₹9 LPA" (the region block, `lib/apply/application-facts.ts`). Never used otherwise. |

**Region block in drafts.** Cover letters, LinkedIn messages, recruiter replies and follow-ups get the facts a screener in that region looks for, taken only from your private settings and only what you opted to share: GCC (visa status, notice period, availability to relocate; nationality only when you turn it on in Settings › Search › Share in cover letters and outreach), India (current and expected CTC only with the opt-in above, notice period), Remote (your time zone, for the overlap sentence). LinkedIn connection notes never carry it. The prompt is told to use only those facts and invent nothing.

### Assumptions the user must set

- **An FX rate** for INR (and EUR / GBP if used). Without it, a GCC posting
  cannot be converted to INR and pay shows as unknown, with a link to the
  table.
- **India's effective tax rate.** GCC places default to 0% because the UAE,
  Saudi Arabia, Qatar, Kuwait, Bahrain and Oman levy no personal income tax
  on salaries (Oman has announced one for high earners from 2028; update
  the rate then). India and "elsewhere" have no default, so take-home stays
  "after tax: unknown" until you set it.
- **Housing and living costs** for the places you compare. Without them the
  estimate stops at "after tax". When a posting says housing is provided or
  paid as an allowance, housing counts as 0 for that job, and the list of
  assumptions says so.

### Optional free FX source

"Fetch ECB rates" calls [Frankfurter](https://frankfurter.dev)
(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR,GBP`), an
open-source, keyless API that republishes the European Central Bank's daily
euro reference rates. The ECB publishes them for information and allows
reuse with the source named. lee calls it only when you click, with an
honest User-Agent and a timeout, fills the form, and saves nothing until you
press Save (the table then shows "from ECB reference rates" and the date).

## The criteria model

Seven criteria, each 0–100 with evidence lines (each with an effect in
points, a confidence and a source). Pay, benefits and location are
**relative**: your current job is the 50 baseline. Growth, environment,
stability and work-life are **absolute**: the current job scores from your
own ratings ((rating − 1) / 4 × 100), the opportunity from base 50 plus the
listed effects.

| Criterion | Opportunity score | Current job | Sources |
|---|---|---|---|
| **Pay** | 50 + 50 × log2(ratio): +100% → 100, −50% → 0. The ratio is take-home after tax when both places have a tax rate, else gross (labelled). What is left after living costs is shown beside it, not used as the ratio, since small leftovers turn modest pay gaps into huge percentages. | 50 once pay is entered | Posting text or salary field (parsed by `lib/discovery/relevance/pay.ts`), USD pegs (central banks) or your FX table, your assumptions |
| **Benefits** | 50 + 50 × (better − worse) / known rows | 50 once any benefit is set | Posting text (verbatim quote), parsed job details, your current benefits |
| **Growth** | Unknown without a JD. Level step up +15 / down −15 (an unmarked title reads as Mid-level), team or leadership scope in the JD +8, ownership or architecture scope +5, years asked (context), new skills named in the JD or stack +3 each (max +12), on your study list +4 each (max +8), domain fit +8 (payments, e-invoicing, data you have done) or new domain +3, learning budget +6, mentoring / career path +6, funding news +5; company size listed as context | Growth and tech-stack ratings | Title seniority rules, master profile skills, study list, posting quotes, Wikidata, GDELT news |
| **Environment** | The company reputation *Environment & culture* criterion (your review ratings, confirmed summary pros/cons and red flags), plus −5 per pressure phrase in the posting ("fast-paced", "hustle"; max two) | Manager and culture ratings | Your review notes, confirmed reputation summary, posting quotes |
| **Stability** | The *Company structure & stability* criterion (Wikidata age and size, confirmed layoffs / unpaid salaries / fraud flags), −10 for a contract role | Job-security rating | Wikidata, confirmed reputation summary, employment type |
| **Location & visa** | Remote +10, same country +10; abroad: visa stated +15, refused −25, not stated = unknown; relocation +10, annual flight +5 | 50 once your country is set | Job location vs yours, posting quotes |
| **Work-life** | Work mode (the posting's field, else the mode the JD states) vs yours ±10 per step, travel −5, hours / shift signals (night or rotational shifts, on-call, 6-day weeks, weekend work) −10 each (max two), leave days vs yours ±5 | Work-life rating | Work mode, posting quotes, your leave days |

Only **confirmed** reputation data is scored (the same rule as the
Reputation panel). Unconfirmed alarming news (GDELT wage theft, fraud,
visa / contract) is listed under red flags as "To check" and never scored.

**Weighted total:** Σ weight × score over the known criteria ÷ Σ their
weights. Weights are 1, or 2 for "what I want more of"; on the side-by-side
page you can move them from 0 to 3 live (not saved). The total shows the
share of weight that is known.

**Verdict line:** the pay difference plus each criterion that differs by 10
points or more ("Likely +35% take-home, better growth, unknown benefits").

**Questions to ask:** every unknown benefit (visa and family visa, housing,
annual flight, bonus, leave, gratuity, learning budget …) and every unknown
criterion becomes a recruiter / HR question, copyable as a list.

## Where it shows

- **Discovery detail** (`/discoveries/[id]`, the scales icon on a
  discovery row) and **application detail**: the "Compare with current
  job" card with the chart, verdict, gains / losses / unknowns, pay with
  assumptions, the benefits checklist, red flags, reviews (deep links only;
  review sites are never scraped), questions and the evidence per
  criterion.
- **Side by side** (`/compare?ids=d:<uuid>,a:<uuid>`): up to three jobs and
  the current job, table plus chart, sorted by weighted total.
- **Shortlist and Prepare:** a compact chip, e.g.
  "vs current: pay ↑ 35% est. · growth ↑ · benefits ?".

## Shortlist factor (off by default)

The daily shortlist ranking does not change unless you turn on "Factor the
comparison into the shortlist ranking". Then, at the next build, the top
3 × N candidates by the usual rank are compared with your current job and
each gets one more reason chip, "vs current job: ±X weighted", worth
(weighted total − current job's total) / 5 points, capped at ±8
(`lib/apply/rank.ts`). Candidates whose total is unknown get no nudge.

## AI narrative (optional)

On demand from the card. Signal-gated: it needs a current job and at least
three known facts. The model gets only the facts the card shows (job side,
red flags, your review average) and the unknowns, each with an id. It never
gets your current salary or employer, only the estimated difference.
Sentences without a valid citation, or with a figure that no cited fact
contains, are dropped. You edit the draft and confirm it; confirmed
narratives are stored on the `job_comparison` row (at most 50). Calls go
through your AI client and are logged as `job_comparison_narrative` (token
counts only, never content).
