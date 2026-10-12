# Hiring-process matching: "would I get through?" (design, 2026-10-12)

Status: proposal. Nothing here is implemented. Read-only research and design; no app code changed.

**Ask.** "Refer how a hiring process works, such as resume, ATS, hiring, etc., and reverse-engineer the process to have better matching."

**One-line answer.** Today lee scores a posting as a sum of ten parts. A real hiring funnel works differently: it is a chain of gates, and each gate is run by a different actor reading different signals. lee should model that chain. The chain has five stages:

- (a) eligibility knockouts;
- (b) what the ATS and a recruiter's keyword search see in the CV you send;
- (c) the recruiter's 30-second screen;
- (d) the hiring manager's depth check;
- (e) the odds for this posting.

Show it per job as a **screening path**. Turn the stage outcomes into **ceilings** and a **min/multiplicative** combination, not into additive context points. Then learn the stage pass rates from the user's own outcomes.

Builds on what is already in progress. These are not redesigned here:

- the role ceilings;
- the "Needs a look" group;
- one displayed-Fit helper;
- the eligibility ceiling (branch `fix/fit-eligibility-ceiling`, Match `m5`: `CEILINGS.ineligible = 30`, `regionFit(...).ineligible`, off-target domain ≤ 2);
- the 156-posting calibration eval (`tests/eval/calibration-cases.ts`, `tests/eval/discovery-calibration.ts` on that branch).

Line numbers refer to `main` at `7bd17b55` unless a branch is named.

---

## 1. Research: how hiring actually works

Method: web research on 2026-10-12, using vendor docs first, then studies, then press. Each finding is tagged **[E]** (evidence: a vendor or government doc, a peer-reviewed or methodologically described study, a large-dataset benchmark, a law or court source) or **[W]** (weak: a blog, an unsourced statistic, a tiny sample, marketing). **[F]** marks folklore that the evidence contradicts or cannot support. Where a page could not be opened and the claim rests on a search snippet, that is said.

### 1.1 The funnel, and who decides what

| Stage | Who decides | Signals actually used | Evidence |
|---|---|---|---|
| Requisition and JD | Hiring manager plus recruiter | "Basic/required" vs "preferred/asset" qualifications become the ATS's criteria | Taleo's *Required* vs *Asset* criteria and ACE threshold [E] (docs.oracle.com/en/cloud/saas/taleo-enterprise/20b/otrec/candidate-prescreening.html); Workday HiredScore grades on *basic* qualifications [E] (doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/reference--candidate-grades.html) |
| Sourcing | Recruiter | Boolean or AI search over LinkedIn, the ATS database and job-board CV banks (Resdex, Bayt) | §1.4 |
| ATS intake and knockouts | **Employer-configured rules**, not the parser | Answers to screening questions: work authorisation, location, licence, years, notice, salary | Greenhouse Auto-Reject fires **only on application-question answers**, never on résumé content [E] (support.greenhouse.io/hc/en-us/articles/203105595); SAP SuccessFactors "Disqualifier" questions → "Auto Disqualified" [E] (learning.sap.com, SAP KBA 2272147); Taleo disqualification questions exit the candidate "instantly" [E] |
| Recruiter screen | Recruiter (2,500+ applications and about 14 reqs each) | Current title and company, dates, previous title, education, location and visa, then keywords | Ladders eye-tracking 2012: about 6 s initial scan, with 80% of the time on name, current title/company, dates, previous title/company and education [E, n=30] (recruitingdaily.com/?p=18946); 2018 rerun 7.4 s [E, thin method] (hrdive.com/news/…/541582); ERE: "6 seconds" is a keep-reading decision, not the whole review [W] (ere.net/articles/is-the-6-second-resume-scan-a-myth) |
| Hiring-manager review and interviews | Hiring manager and panel | Depth on the must-haves, the responsibilities | Gem 2025: about 20 interviews per hire, about 36 for technical roles [E] |
| Offer | Hiring manager, HR | Pay band, notice, visa cost | Gem 2025: offer acceptance 84% [E] |

**Base rates.**

- Gem 2025 Recruiting Benchmarks [E, 140M+ applications] (gem.com/blog/10-takeaways-from-the-2025-recruiting-benchmarks-report):
  - about 0.5% of applicants are hired, about 200 applications per hire;
  - job boards bring 49% of applications but 24.6% of hires;
  - sourced (outbound) candidates are about 5× likelier to be hired than inbound applicants.
- Ashby [E, vendor data]: technical roles take about 610 applications per hire in the Americas and about 254 in EMEA (EMEA is a snippet). Week 1 of a posting gets 2.5–3× more applications than any later week (ashbyhq.com/blog/recruiting/2023-trends-report-applications-per-job).
- **Referrals.** At one financial firm, referrals were about 6% of applications but more than 25% of hires (Burks, Cowgill, Hoffman & Housman, NY Fed/IZA DP 8175) [E] (iza.org/publications/dp/8175). Jobvite's "7% of applicants → 40% of hires" is widely repeated with no visible method [W].
- **Apply early.** TalentWorks' "8× more likely in the first 96 hours" comes from one startup's user base [W] (paulvanderlaken.com/2017/10/24/…). Ashby's week-1 volume data supports "early" only indirectly [E].

### 1.2 Myths vs evidence about the ATS

1. **"75% of résumés are rejected by an ATS before a human sees them" [F].** The claim traces to 2012 marketing by Preptel, a résumé-optimisation vendor that closed in 2013. It never published a method (resumevera.com/guides/ats-rejection-myth-origin; blog.hiringthing.com/applicant-tracking-system-myths) [W, but the debunk is consistent with vendor docs]. In Enhancv's survey of 25 US recruiters, 92% said their ATS does not auto-reject on format, content or match score, and 100% use knockout questions [W, n=25, vendor] (enhancv.com/blog/does-ats-reject-resumes/).
2. **What *is* true: rigid criteria screen people out.** HBS/Accenture *Hidden Workers* (2021; 8,720 workers, 2,275 executives) [E]:
   - 88% of employers say qualified high-skill candidates are vetted out for not matching exact JD criteria (94% for middle-skill);
   - more than 90% use the ATS/RMS for a first cut or ranking;
   - almost 50% filter out employment gaps over 6 months.

   (theregister.com/2021/09/08/harvard_jobs_report/; hbswk.hbs.edu/item/how-to-tap-the-talent-automated-hr-platforms-miss; the full PDF returned 404.) Rejection is mostly **configured knockouts and recruiter filters**, not parse failures.
3. **AI ranking assists, it rarely decides.** Workday HiredScore grades A–D: A = all basic qualifications, most preferred ones, and above a threshold; B = all basic; C = most basic; D = not most basic. It has a Fit & Gap view. The docs do not mention auto-rejection [E]. iCIMS "Role Fit" ranking [E/W]. Ashby AI review marks each criterion Meets / Does not meet with citations, and a human decides [E] (docs.ashbyhq.com/ai-assisted-application-review). Greenhouse Talent Filtering suggests JD keywords and "does not rank or reject" [E].
4. **One résumé-side hard filter exists.** Zoho Recruit's Zia Match Score splits primary (mandatory) from secondary skills. A missing primary skill means Zia will not suggest the candidate, and recency and duration of skill use count [E, Zoho community post] (help.zoho.com/portal/en-gb/community/topic/mastering-zia-match-scores-lets-talk-recruit). Zoho Recruit is common with GCC SMEs and agencies.
5. **Liability is real.** In *Mobley v. Workday* (N.D. Cal.), a nationwide age-discrimination collective over AI recommendations was conditionally certified on 2025-05-16 [E] (hklaw.com/…/federal-court-allows-collective-action-lawsuit-over-alleged). NYC LL 144 has required bias audits since 2023-07-05, but compliance is near-null: 18 of 391 employers posted an audit (FAccT 2024) [E] (arxiv.org/html/2406.01399v1). The EU AI Act classes recruitment AI as high-risk (Annex III §4) [E]. The application of those obligations was reportedly deferred to 2027-12-02 by the AI Omnibus; verify on EUR-Lex [W/E]. LLM screeners show name-based bias: Wilson & Caliskan, AIES 2024, 3M comparisons [E] (ojs.aaai.org/index.php/AIES/article/view/31748). *For lee:* lee's own AI score must never see the user's name or photo, and it is advisory only.

### 1.3 Parsing: what breaks, what doesn't

- **Columns.** At least 15% of CVs use columns. Naive reading interleaves them. Textkernel's ML raised column detection from 60% to 82% and well-rendered CVs from 62% to 90% [E] (textkernel.com/learn-support/blog/improving-extraction-from-column-resumes). Columns are a real but shrinking risk.
- **Scans and images.** OCR is limited (RChilli: one page, degrades with small or script fonts) [E] (help.rchilli.com/hc/en-us/articles/360023626934).
- **Headers, footers, tables, text boxes.** "May be dropped" appears in employer FAQs and blogs, not in vendor test data [W] (careers.roche.com/global/en/resume-parsing-faq). Keep contact details in the body anyway; it costs nothing.
- **Fields parsed.** Name, contact, skills, education and experience (title, company, dates) are standard across Zoho [E] (help.zoho.com/portal/en/kb/articles/resume-parser), Lever [W, the help page did not load] and Textkernel.
- **Normalisation.** Titles map to taxonomies such as ISCO-08 and O*NET (Textkernel Professions API) [E] (developer.textkernel.com/tx-platform/v10/skills-intelligence/professions-api/overview/). Skills map to ontologies: Workday Skills Cloud [E/W], Lightcast Open Skills with about 33k skills [E] (docs.lightcast.io).
- **Gap.** No public vendor doc details date or tenure parsing ("Present", month precision). Use the plain "Mon YYYY – Present" convention.

### 1.4 Recruiter search

- Greenhouse search is keyword-based [E]. LinkedIn Recruiter supports full Boolean (AND/OR/NOT, quotes, parentheses, no wildcards) [W, third-party guides]. LinkedIn added natural-language AI-Assisted Search, and Hiring Assistant became global in English in September 2025 [E] (news.linkedin.com/2025/hiring-assistant-globally-available). SAP and Workday add "related skill" matching [E/W]. **Exact terms and acronyms still decide keyword searches; synonyms help only in semantic tools.**
- **Rediscovery.** Past applicants stay searchable by keyword, scorecards and the stage reached (Greenhouse Talent Rediscovery / Past Candidates) [E]. An application leaves a record for future reqs at the same employer.
- **CV banks drive GCC and India sourcing.**
  - **Naukri Resdex** filters by keyword/Boolean, location, experience, current and expected CTC, **notice period** (including "serving notice") and profile-modified recency [E, vendor] (recruiterzone.naukri.com/hire-faster-with-notice-period-search; the Resdex FAQ returned 403, so this is a snippet).
  - **NaukriGulf** CV search has 27+ criteria [E, vendor] (naukrigulf.com/employer-cv-search, which timed out, so a snippet).
  - **Bayt** CV search filters on **visa status, nationality, residence location, country of degree**, age and gender [W/vendor] (bayt.com/en/blog/3537/…).

  The profile's visa, location and notice fields therefore decide whether the user *appears* at all. The claim that Naukri ranks you higher if you "update daily" is unverified [W].

### 1.5 Recruiter heuristics: what is evidenced

- **Title and recency first.** This is the Ladders fixation data [E].
- **Gaps.** Callbacks fall with unemployment duration, most of it in the first 8 months (Kroft, Lange & Notowidigdo, QJE 2013, 12k fictitious résumés) [E] (povertyactionlab.org/evaluation/dependence-duration-and-labor-market-conditions-evidence-united-states). In LinkedIn's 2022 survey, about 1 in 5 employers would decline an extended gap [W].
- **"Apply if you meet 60%" [F as a statistic].** It traces to an unpublished HP internal report quoted in HBR (2014). In Mohr's own survey, the top reason people did not apply was misreading the process, "I didn't think they would hire me since I didn't meet the qualifications" (41% of women, 46% of men) [W, self-selected n≈1,000]. LinkedIn platform data: women apply to 20% fewer jobs but are 16% likelier to be hired once they apply [E] (Gender Insights Report 2019). **There is no rigorous public study of the share of must-haves hires actually meet, or of how flexibly years are read.** The design treats "years" and "nice-to-haves" as soft *because the tooling does*: Taleo assets are weighted, HiredScore B = all *basic* only. It does not rest on a 60–80% statistic.
- **Degree requirements are stickier than ads suggest.** Burning Glass Institute/HBS (2024): degree requirements were dropped from about 4× more postings, yet non-degree hires rose only about 3.5% (fewer than 1 in 700 hires), and about 45% of firms changed "in name only" [E] (burningglassinstitute.org/research/skills-based-hiring-2024).
- **Job hopping and impact bullets.** No rigorous public evidence was found [gap]. Treat both as presentation advice, not as score inputs.

### 1.6 GCC practice

| Topic | Finding | Tag |
|---|---|---|
| UAE permit | Working without a MOHRE permit is illegal, including on a visit visa. Employers convert a visit visa in-country by "status change". 2025 fines are AED 100k–1M per illegal hire. "Must be in UAE" ads are about **cost and speed**, not legality. | [E] khaleejtimes.com/uae/legal/uae-dh50000-fine-for-hiring-residents-without-work-permit; britishchamberdubai.com/guest-article/3609 |
| UAE transfer | No NOC needed to move mainland employers since Decree-Law 33/2021 (in force 2 Feb 2022). There is a grace period after cancellation. 12 permit types include *transfer* and *family-sponsored*: cheaper, faster "local hires". | [E] clydeco.com/en/insights/2023/01/…; gulfnews.com/…/12-permits-mohre-says-you-must-have-1.500419895 |
| UAE Job Seeker visa | 60/90/120 days with no sponsor, for MOHRE skill levels 1–3 with a degree, or top-500 graduates. A legal way to become an "in-UAE" candidate. | [E, news citing ICP] thenationalnews.com/news/uae/2024/01/29/uae-jobseeker-visa-rules |
| UAE skill level and attestation | A software developer is normally skill level 2 (ISCO-based). Skilled classification needs an **attested** degree (state → MEA → UAE embassy → MOFA). | [E] u.ae/en/information-and-services/jobs/employment-in-the-private-sector/skill-levels-of-jobs-in-the-uae |
| Emiratisation | Firms with 50+ staff: +2%/yr Emiratis in skilled roles, fines AED 108k per shortfall for 2025 and AED 10k/month from 2026. Firms with 20–49 staff in 14 sectors including **ICT** and finance: at least one Emirati. These are ratio quotas, **not** "developer jobs reserved". Only explicit "UAE nationals only" ads are closed. | [E] gulfnews.com/…/1.500369943; EY alert assets.ey.com/…/ey-uae-mohre-announces-new-requirement… |
| UAE anti-discrimination | Decree-Law 33/2021 Art. 4 bans nationality discrimination (Emiratisation excepted). MOHRE condemns nationality-specific ads, but they persist on WhatsApp and Facebook. | [E] mondaq.com/…/1410368; khaleejtimes.com/uae/legal/uae-specifying-nationalities-for-job-posts… |
| UAE notice | 30–90 days by law (Art. 43). | [E] chambers.com/articles/the-notice-period-under-uae-federal-decree… |
| UAE pay | Basic + housing + transport. Gratuity is on **basic** only. | Law [E]; split % [W] |
| Agencies | MOHRE-licensed. **Candidates must not pay fees**; the employer pays. "Pay for visa/medical" is the standard Gulf scam. | [E] u.ae/en/information-and-services/jobs/searching-for-a-job/recruitment-agencies; thenationalnews.com/news/uae/2025/09/04/uae-jobs-scam |
| Kuwait permits | An Article 18 transfer needs 3 years' service, or employer consent after 1 year. Exit permits for Article 18 workers since July 2025. PAM verifies degree and accreditation automatically. **The first permit's job title is close to fixed** (Circulars 1/2025, 1/2026). | [E] gulfnews.com/world/gulf/kuwait/…1.500121765; …1.500084417; [W] wego guides |
| Kuwait "Engineer" title | Requires a **Kuwait Society of Engineers** NOC (accredited programme plus exam). Indian degrees generally need NBA accreditation. A "Software Developer / Programmer / IT Specialist" title avoids it. Whether "Software Engineer" is in KSE scope is **unconfirmed**. | [E] kuwaittimes.com/indian-engineers-worst-affected-by-degree-accreditation-decision; bal.com/perspectives/… |
| Kuwaitisation | The public sector is closing to expats (contracts not renewed after 31 Mar 2025). Private-sector quotas are sector-based, about 1% to about 39% (banking). Expats are about 96% of the private sector. | [E] gulfnews.com/…1.500075766; kuwaittimes.com/article/46967 |
| Saudi | Nitaqat bands by sector. Engineering Saudisation (25%) targets civil/industrial-type engineers, not software. An SCE-linked "Engineer" iqama title needs SCE registration. Skill-based permit classes (High-skill / Skilled / Basic) since July/Aug 2025; a junior-mid developer is likely "Skilled". | [E] kslaw.com/…; saudieng.sa; arabnews.com/node/2607118 |
| **Oman** | Omanisation **bans expat computer programmers and computer engineers from 1 Jan 2026** (systems analysts from 2025, web designers from 2027). | [E] kpmg.com/om/en/insights/2024/10/… |
| Qatar | Law 12/2024 on Qatarisation (in force April 2025): employers must prefer Qataris, with sector plans. | [E] clydeco.com/en/insights/2024/10/qatar-law-no-12-2024… |
| Platforms | NaukriGulf: biggest market UAE, then KSA. Bayt filters on visa/nationality/residence. LinkedIn reaches about 89% of the UAE population. Gulf CVs commonly carry photo, DOB, nationality and visa status [W]. "Regional experience preferred" is anecdotal only [W]. | [E/W] as cited above; stats.napoleoncat.com |
| India emigration | Graduates hold non-ECR passports, so no emigration clearance is needed. A proposed eMigrate registration for non-ECR travellers is unconfirmed. | [E] mea.gov.in/Images/attach/Emigration_and_You_new.pdf |

### 1.7 India and remote

- **India:**
  - Naukri screening questionnaires auto-suggest experience, key skills, designation, CTC, current location, education and **notice period**, and can be mandatory [E] (recruiterzone.naukri.com/?p=5721).
  - Notice is 90 days at large IT services firms (TCS; Infosys JL4+). Buyouts are at employer discretion [W].
  - foundit (2026): about 1 in 3 postings flag "immediate joiner / short notice"; 27% of demand wants joining within 15 days, but only 14% of candidates can [E-ish, method unpublished] (socialnews.xyz/2026/03/18/…).
  - CTC includes employer PF, gratuity and variable pay; in-hand is lower [W].
- **Remote:**
  - "Remote" is often country-locked for payroll, tax and law. In one small sample, 59% of Jobicy remote posts were US-only [W] (relocateme.substack.com/p/how-to-find-remote-from-anywhere).
  - EOR platforms cover India and the UAE: Deel 150+ countries, Oyster 180+, Remote onboards UAE EOR [E, vendor].
  - US companies hiring via Remote (March 2026): Philippines, Canada, **India**, UK, Mexico, Brazil [E, vendor] (remote.com/blog/where-us-companies-hiring-globally-march-2026).
  - The usual time-zone ask is 3–4 hours of overlap. IST overlaps GCC and CET mornings easily [W].
  - Contractor misclassification risk sits with the foreign company; EOR avoids it [W].

### 1.8 What this means for matching (the ten design drivers)

1. **Knockouts are where automatic rejection really happens** (Greenhouse, SAP, Taleo, Naukri). Eligibility must be a **gate with known/unknown/fail**, and lee should prepare the answers.
2. **The "75% ATS rejection" figure is folklore.** Parsing is a secondary risk. lee should not frighten the user about format, but it should fix the real risks: columns, ligature extraction, images.
3. **Modern AI grading mirrors "basic vs preferred" qualifications** (HiredScore A–D, Taleo Required/Asset/ACE, Zia primary/secondary). lee should grade must-haves separately from nice-to-haves and treat a missing must-have as a stage outcome, not a few points.
4. **Keyword search is still literal in many tools** (Greenhouse, Boolean on LinkedIn and Resdex). Measure the **CV variant's literal terms**, not only lee's synonym-aware profile match.
5. **Recruiters scan title, employer, dates and education first** (Ladders). Title alignment and relevant, recent years belong in a recruiter stage.
6. **A referral is the biggest single lever** (6% of applications → more than 25% of hires; sourced candidates 5×). It belongs in "odds" and actions, not in Fit.
7. **GCC "in-country only" is about cost and speed, not legality**, and there is a sponsor-free route (the UAE Job Seeker visa). So in-country preference is **at risk**, not fail; "must already hold a transferable visa" is fail.
8. **Country and title rules can be absolute knockouts:**
   - Oman bans expat programmers from 2026;
   - nationals-only ads;
   - Kuwait's KSE rules for an "Engineer" permit title;
   - Saudi SCE for an "Engineer" iqama title.
9. **CV banks filter on structured fields** (notice period, visa status, residence, CTC, recency). lee's profile facts matter for discoverability, not only for the CV.
10. **Gaps are penalised** (Hidden Workers, Kroft). There is no evidence for "60–80% of requirements" or for flexible years. Both are encoded as tool-mirroring soft rules and calibrated against the user's own outcomes.

---

## 2. What lee has today, seen through the funnel

| Funnel stage | What a real hiring team uses | What lee has | Gap |
|---|---|---|---|
| Eligibility / knockouts | Work authorisation, sponsorship, location/relocation, nationals-only, language, degree, notice, years (as an application question) | Partly: nationals-only/preferred, presence-required, visa offered (`lib/discovery/relevance/signals.ts:116,217,225,235,247`); languages (`signals.ts:291,317`); the location rule; and the m5 eligibility ceiling. They score as **additive points** (`lib/discovery/match/signals.ts:100-116`, visa −15…+5) or as ceilings (language 34, ineligible 30). | No degree, attestation, notice/"immediate joiner", driving-licence, certification-mandatory or "years as a knockout question" checks. Presence-required is an info chip only (`relevance/soft-rules.ts:105`). There is no known/unknown/fail state. |
| ATS parse and keyword search | The text the parser extracts from **the file you send**. Exact terms plus whatever synonym/skills normalisation the ATS has. Recruiter boolean search. | The Match Score reads **profile** skills with a synonym/concept/sibling lexicon (`match/skills.ts:29-50`, `match/lexicon.ts`). It is generous: Laravel satisfies "a PHP framework", MySQL earns ½ for PostgreSQL. The CV Score has an ATS-parseability dimension (`lib/cv-score/dimensions/ats.ts:126`). Best-CV coverage is computed per variant (`lib/cv-fit/score.ts:62,112`). | Match never asks whether the JD's literal must-have terms **appear in the CV variant the user will send**. A recruiter searching "PostgreSQL" does not find a CV that says "MySQL". The CV Score's ATS checks are not tied to the job. |
| Recruiter 30-second screen | Current/recent title, years in the relevant stack, recency, employer/domain similarity, location, notice, job hopping/gaps, quantified impact | Seniority from title and years (`match/fit.ts:50-109`), role family (`match/role.ts:33-65`), domain (`signals.ts:118`) | Total years only (`match/profile.ts:40-48`). No **relevant** years, no recency, no title alignment between **your** title and the JD's, no impact evidence. |
| Hiring-manager depth | Can you do the duties? Evidence that holds up in an interview | Responsibilities overlap (`match/coverage.ts:72-84`), requirement checks with evidence quotes (`coverage.ts:51-70`), READY-only evidence (`match/evidence.ts`, `lib/resume/readiness.ts:39-154`) | Good base. It is not split into "interview-ready" (you can explain the implementation) versus "domain-ready only" (you can describe the design), and it is not presented as a stage. |
| Competition / odds | Applicant volume, posting age, referral, agency vs direct, in-country preference | Posting date (`postedAt` from adapters), LinkedIn connection counts (`lib/company-discovery/warm.ts:18`, `lib/integrations/linkedin/connections.ts:49` `referralHint`), apply channel (`lib/apply/checklist.ts:41` `applyChannel`), shortlist freshness | Not combined. Odds are mixed into the shortlist rank (`lib/apply/rank.ts`) as points. |
| Outcomes | Which stage you reached | `applications.status` with `saved…offer/rejected/withdrawn` (`lib/ui/status.ts:3-12`). `activities` logs `status_change {from,to}` (`lib/applications/service.ts:95`, `lib/db/schema.ts:296`). `discovery_feedback` holds dismiss reasons (`lib/db/schema-apply.ts:54`). `applications.referredByContactId` and `source` exist (`schema.ts:177-211`). | No snapshot of the score at the moment of applying. No "ghosted" outcome. No record of which stage a rejection came from (it is derivable from the `from` field of `status_change`). No channel (direct / agency / referral / Easy Apply). Analytics calibrate the AI score only (`lib/analytics/service.ts:258-281`). |

The structural finding matches the 2026-10-10 reviews. The score **adds** context points (seniority, region, mode, visa, domain: about 40 points that do not depend on the role). The funnel instead **multiplies**: a knockout at any stage ends the application, whatever the other stages say. A real recruiter never trades "Dubai, visa offered" against "not a backend role".

---

## 3. The model: a staged "would I get through?" path

### 3.1 Stage outcomes

Every stage returns the same shape. It is pure and deterministic, and it is computed from the parsed JD (`match/jd.ts:169` `parseJd`), the ready profile (`match/profile.ts:62` `matchProfileFrom`) and, where available, the best CV variant (`lib/cv-fit`).

```ts
type StageStatus = 'pass' | 'at_risk' | 'fail' | 'unknown'
interface StageCheck {
  key: string                 // 'visa', 'nationals', 'degree', 'notice', 'keyword:postgresql', ...
  status: StageStatus
  reason: string              // "JD: 'UAE nationals only'" / "You: sponsorship needed in AE"
  action?: ScreenAction       // what raises the odds (section 4)
}
interface StageResult {
  stage: 'eligibility' | 'ats' | 'recruiter' | 'manager' | 'odds'
  status: StageStatus         // worst check, with the 'unknown' rules below
  score: number               // 0..1, how strongly it passes (used in the combination)
  checks: StageCheck[]
}
interface ScreeningPath { v: string; stages: StageResult[]; verdict: Verdict; ceiling?: MatchCeiling }
```

The stage status is the **worst** of its checks. The exceptions are `unknown`, which never lowers a `pass` to `fail`, and two or more `unknown` checks in the eligibility stage, which make the stage `at_risk`. That is where the "unknown" knockout lives: the JD did not say, so lee says what to ask or answer.

### 3.2 Stage (a): eligibility and knockouts (a hard gate)

These mirror the questions an ATS asks before a human reads anything: work authorisation, sponsorship, location, language, degree, notice, years. Each check is **known pass / unknown / at risk / fail**.

| Check | Fail | At risk | Unknown (with the question to prepare) | Pass | Source in code (reuse) |
|---|---|---|---|---|---|
| Location / remote eligibility | Remote only for named countries you are not in; on-site elsewhere with no relocation you accept | Remote, eligibility unclear | Location not stated | In your regions / remote-eligible | m5 `regionFit(...).ineligible`, `relevance/location-rule.ts` |
| Nationals only (Emiratisation, Kuwaitisation, Saudisation…) | `detectNationalsOnly` | `detectNationalsPreferred` | — | — | `relevance/signals.ts:235,247` |
| Sponsorship (GCC, you need a visa) | JD says "no sponsorship" / "own visa" / "must hold a transferable visa/iqama" | "Candidates in the UAE preferred", "local hire", "immediate joiners in UAE" | Not mentioned | Visa offered | `signals.ts:217,225`; split `PRESENCE_REQUIRED` into *must already hold a visa* (fail) and *in-country preferred* (at risk) |
| Language | Mandatory language you lack (also the 34 ceiling) | Required, not mandatory | — | English only / you speak it | `match/signals.ts:58-90` |
| Degree | JD requires a degree you don't have (e.g. "BE/BTech in CS mandatory") | Degree required and `credentials` unknown | — | Matching degree in `profile.credentials` | `jd.ts` `EDUCATION` (`jd.ts:83`), `MatchProfile.credentials` (`types.ts:84`) |
| Degree attestation (GCC) | — | JD says "attested degree" and the user has not marked the degree as attested | GCC on-site role (see §1 for when attestation is needed for the work permit) | Attested | **new** pref `degreeAttested: 'yes'|'in_progress'|'no'|null` |
| Notice / start date | — | "Immediate joiners only" / "join within 15 days" while your shortest notice is longer | — | Your notice fits | `discoveryPrefs.noticePeriods` (`relevance/discovery-prefs.ts:57-73`); **new** detector `detectNoticeAsk` |
| Years as a knockout | Ask ≥ 2× your years **and** worded as a hard minimum ("minimum 5 years", "at least 5") | Ask > your years + 1 | — | Within a year | `jd.years`, `relevance/seniority.ts:104` |
| Mandatory certification / licence | JD says a licence/certification is mandatory and you have none (e.g. a UAE driving licence for a field role, an SCE/KSE engineer classification) | Required, not mandatory | — | Held | `jd.certifications`, **new** licence detector |
| Country profession ban | Expat ban on this profession in the posting country: Oman bars computer programmers and computer engineers from 2026-01-01, systems analysts from 2025 and web designers from 2027 (§1.6) | — | — | — | **new** data table `lib/discovery/relevance/profession-bans.ts` (country, title regex, from-date, source URL), reviewed quarterly |
| Permit title rules (Kuwait KSE, Saudi SCE) | — | Kuwait or KSA posting with an "Engineer" title, and the user's degree is not KSE/SCE-accredited (Kuwait: Indian degrees generally need NBA accreditation) | Accreditation not stated in the profile | Developer/programmer title, or an accredited degree | **new** pref `engineerAccreditation` and a title check. The action: "ask whether the permit title can be Software Developer" |
| Contract / shifts (already gate rules) | Per the user's rule mode | Per the user's rule mode | — | — | `relevance/signals.ts:47,67` |

**How it maps to Fit:**

- `fail` gives the existing `CEILINGS.ineligible` (30), with the first failing reason, or the language ceiling (34). Implement it by extending m5's `ceilingOf(jd, mandatoryUnmet, ineligible)` (branch `fix/fit-eligibility-ceiling`, `score.ts`) to take the eligibility stage's first fail. Do not add a new mechanism. `cappedFit` and `blendedSql` already honour `detail.ceiling`.
- `at_risk` gives a stage score of 0.7 and no ceiling.
- `unknown` gives 0.9 and a prepared answer (§4).

**Visa as points.** The visa points (`match/signals.ts:100-116`, −15…+5) become this stage's checks. Drop them from the additive sum in P1, because the information moves into a gate. "Visa offered" stays a reason and an odds booster, not +5 Fit.

### 3.3 Stage (b): ATS parse and keyword match against the CV you will send

What the ATS and a recruiter's search see is the **text of the file**, not lee's profile. The stage therefore reads the **chosen résumé variant**: the best CV (`discoveries.best_cv`, `lib/cv-fit/score.ts:163` `pickBest`), or the application's `resumeVariantId`. It also reads the JD's must-have terms.

1. **Term set.** These are the JD's must-have and "mentioned" skills from `extractRequirements` (`match/requirements.ts:53`), kept **as the JD spells them** ("PostgreSQL", "CI/CD", "RESTful APIs"), not only their canonical form.
2. **Literal presence.** For each term, check whether the variant's rendered text (`lib/cv-fit/evidence.ts`, `VariantEvidence`) contains the term or an **ATS-safe equivalent**. Equivalents are:
   - the same skill under a spelling the major parsers normalise (case, punctuation, "Node.js"/"NodeJS", plural);
   - an acronym written alongside its expansion ("ZATCA (e-invoicing)", "REST APIs").

   The concept and sibling credits from `lexicon.ts` (Laravel ≈ "PHP framework", MySQL ≈ PostgreSQL) count for the **manager** stage, not here. A human understands them; a keyword search may not.
3. **Three buckets per term:**
   - **Present.** The variant shows it.
   - **Addable honestly.** The profile has READY evidence for it (`match/evidence.ts`: an interview-ready skill or one backed by a ready item), but this variant doesn't render it. This produces the action "add 'PostgreSQL' to the Skills line (you have it in project X)".
   - **Missing.** There is no ready evidence. This is a real gap and a study-list item. It is **never** suggested as a keyword to add.
4. **Parse risk.** These are the CV Score's ATS checks for this variant (`cv-score/dimensions/ats.ts:126`): single column, standard headings, contact in the body, no text in images, special characters. Two **new** checks for lee's LaTeX are in §5.

Stage score = weighted literal coverage of must-haves (must 2, mentioned 1, nice ½; the same `REQ_WEIGHTS`, `requirements.ts:17`) after counting the "addable" terms as fixed. The `at_risk` flag means coverage is fine only *after* tailoring.

| Status | Rule (starting values, calibrated by the eval) |
|---|---|
| pass | Literal must-have coverage ≥ 0.7 with the variant as is |
| at_risk | ≥ 0.7 only after the "addable honestly" fixes, **or** a parse-risk finding of severity critical |
| fail | < 0.5 even after the fixes (the must-haves are not in your evidence) |

**Fit mapping.** A `fail` gives the ATS ceiling of **45**: in the fair band, but never "good". Most stack mismatches already show as a low skills component. The ceiling exists to stop context points from lifting such a posting into "good".

### 3.4 Stage (c): recruiter 30-second screen

The recruiter answers: "Is this person the kind of hire on the requisition: title, level, relevant years, a similar domain, and evidence of results?"

| Signal | How lee computes it | Pass / at risk / fail |
|---|---|---|
| **Title alignment** | `classifyRole` on the user's **most recent work title** (`resume.work[0].position`) and the headline, against the JD title's family (`relevance/roles.ts`). Plus the seniority word in each title. | Same family pass; adjacent family (fullstack ↔ backend, integration ↔ backend) pass; other tech family at risk; no tech title fail (this falls to the role ceiling being added) |
| **Relevant years (recency-weighted)** | **new** `relevantYears(resume, jdSkills, now)`. Sum the months of each role whose position, keywords or *ready* highlights name a JD must-have skill. Weight months in the last 3 years ×1.0, 3–6 years ago ×0.6, older ×0.3. Overlaps are merged with `experienceMonths` (`lib/cv-score/career.ts`). | ≥ ask − 1 pass; ≥ 0.6 × ask at risk; else fail. No ask: pass if ≥ 1 year. |
| **Seniority band** | Today's `seniorityComponent` (`match/fit.ts:50`), read as a status | Fits pass; one level above at risk; two or more fail |
| **Domain / employer similarity** | `jd.domains` against ready domains. The industry of past employers (fintech, ERP, e-invoicing) comes from a **new** optional `industry` on resume work items, or from keywords. | Same domain is a bonus; otherwise neutral, never a fail |
| **Impact evidence** | The share of the variant's bullets with a number or outcome. Reuse the CV Score impact dimension (`cv-score/dimensions/impact.ts`). | < 30% of bullets quantified gives at risk with the action "quantify 2 bullets" |
| **Stability / gaps** | Gaps > 6 months, three or more roles < 12 months. Computed from resume dates. | At risk only. Never fail, because practice varies. Shown as "be ready to explain". |

Stage score = the mean of the signal scores (pass 1, at risk 0.6, fail 0.2), **min-capped by title alignment**. A non-matching title is the one thing a 30-second scan rarely gets past.

**Fit mapping.** Title alignment `fail` is the role ceiling already in progress. Do not duplicate it: the screening path **reads** that ceiling's reason. A relevant-years `fail` (less than half the ask in the relevant stack) gives a ceiling of **54** (top of fair).

### 3.5 Stage (d): hiring-manager depth

This is the existing requirement checks, re-split by readiness:

- **met, interview-ready.** The backing evidence comes from an `interviewReady` item. You can explain the implementation.
- **met, domain-only.** Backed by a `domainReady` item only. Say "explain as design/domain work", per the fact-lock rules (`lib/resume/readiness.ts:60` `isDomainWording`).
- **partial / missing.**
- **Responsibilities overlap**: `coverage.ts:72`.

Stage score = (Σ must-have credit, with interview-ready 1, domain-only 0.7, partial 0.5) / Σ weight, blended 70/30 with responsibilities overlap. It has no ceiling. It is the main *ranking* signal among postings that pass (a) to (c), and it is where the skills/concept/sibling credit lives.

### 3.6 Stage (e): competition and odds (shown, not part of Fit)

| Signal | Source | Effect |
|---|---|---|
| Posting age | `normalized.postedAt` (adapters), else first seen | < 3 days "early", 3–14 normal, > 30 "likely stale or evergreen" |
| Referral available | `referralHint(userId, company)` (`integrations/linkedin/connections.ts:49`), `connectionsAt` (`company-discovery/warm.ts:18`) | "Ask <name> for a referral". The biggest lever in the research (§1). |
| Channel | `applyChannel(url)` (`apply/checklist.ts:41`): ATS host, company site, LinkedIn/Bayt/Naukri; **new** agency detector ("on behalf of our client", "recruitment consultancy", a known agency domain) | Agency gives "you are one of their candidates; also apply direct if the employer is named". Easy Apply / aggregator gives high volume. |
| Volume proxy | Remote-worldwide, Easy Apply, a big-brand employer, an aggregator source | "High competition" chip |
| In-country preference (GCC) | Eligibility at-risk "in-country preferred" | "Odds lower from abroad; a visit-visa trip or an agency may help" |

Odds stay **out of Fit**. Fit answers "would a screener pass me?", and odds answer "how many others are in the pile, and can I skip it?". Folding them in would bring back the geography double counting the review criticised. Odds feed the **shortlist rank** (`lib/apply/rank.ts`), replacing its freshness and region points in P1.

### 3.7 How the stages combine into Fit

Today: `Match = clamp(Σ components)`, then the ceiling, then `Fit = (Match + AI) / 2`, capped (`match/score.ts:63-67`, `match/blend.ts:18-49`).

**Proposed (P1, after the stage-labelled eval exists):**

```
gate        = min(ceilings from (a) fail, (b) fail, (c) role/years fail, title-only 55)
screenScore = 100 × s_ats^0.35 × s_recruiter^0.35 × s_manager^0.30     // weighted geometric mean
eligFactor  = 1.0 pass · 0.9 unknown · 0.7 at_risk                    // (a) is a multiplier, not points
Match'      = min(gate, round(screenScore × eligFactor + prefs))     // prefs: work mode/pay ±3 at most
Fit         = cappedFit(Match', AI)                                 // unchanged helper, same ceiling
```

- A weighted **geometric** mean means a near-zero stage drags the whole score down. That is the funnel's AND. An arithmetic sum lets region and visa make up for a missing stack.
- Region becomes an eligibility check (in or out) plus a preference. It stops being 10 to 15 points, so "Dubai" no longer adds a constant.
- Work mode and pay become a small preference term (±3). The "any" preference contributes 0, not 5/5 (review §1.1).
- Starred regions move to the shortlist and odds only. They already exist there (`lib/regions/preferred.ts`).
- The AI half is unchanged here. In P2, the AI prompt receives the stage results and returns a per-stage opinion, and the blend takes the **lower** value when the two disagree by more than 30 (review §1.2).

**Ceiling summary** (one list in `score.ts`):

| Ceiling | Value | Owner |
|---|---|---|
| Not eligible (location, nationals only, no sponsorship, must already hold a visa, hard years knockout) | 30 | m5 branch (extend the reasons) |
| Mandatory language | 34 | existing |
| Role not targeted / no tech evidence | per the role-ceiling work | in progress |
| ATS keyword fail (< 50% of must-haves even after honest fixes) | 45 | **new** |
| Relevant years < 50% of the ask | 54 | **new** |
| Title only | 55 | existing |

### 3.8 What the bands mean (shown in "Why this score")

| Band | Fit | Meaning in funnel terms |
|---|---|---|
| Strong | 75+ | No knockouts. The CV you'd send already shows ≥ 70% of the must-haves verbatim. Your title and relevant years fit. Most must-haves are backed by interview-ready work. **Likely to pass the recruiter screen; worth a tailored application now.** |
| Good | 55–74 | No knockouts, and at most one stage at risk (usually fixable: add honest keywords, quantify bullets, answer notice/visa up front). **Should pass the screen after tailoring.** |
| Fair | 35–54 | An ATS or recruiter stage fails or two are at risk: a stretch on years, stack or title. **Likely screened out on a cold application; apply only with a referral or a strong tailoring case.** |
| Weak | < 35 | A knockout (eligibility, mandatory language) or a role mismatch. **Will not pass the first filter.** |

The "Needs a look" group (in progress) stays a *relevance* disposition: lee is unsure whether this is your kind of role. The bands describe the screening odds of postings that *are* your kind of role.

---

## 4. What lee shows

### 4.1 The per-job screening path

The path appears in the "Why this score" sheet (`components/discovery/match-why.tsx`), above the component list, and on the discovery detail page (`app/(authed)/discoveries/[id]/page.tsx`). Board and list cards (`components/discoveries-board.tsx`, `components/discovery-row.tsx`) show **only** the first non-pass stage as a chip.

```
Screening path                                         Fit 68 · Good
 ✓ Eligibility    Visa offered for UAE · English only
 ! ATS keywords   6 of 8 must-haves in "GCC · Backend" CV · add PostgreSQL, Redis (you have both)
 ✓ Recruiter      Backend Developer → Backend Engineer · 2.5 relevant yrs (asks 2–4)
 ✓ Hiring manager 5 of 6 must-haves interview-ready · payments matches
 ↗ Odds           Posted 2 days ago · 1 connection at Tabby (ask Ameen) · apply direct (Greenhouse)
 Next: 1 Use "GCC · Backend"  2 Add PostgreSQL + Redis  3 Ask Ameen  4 Prepare: notice 1 month, visa needed
```

### 4.2 Actions (`ScreenAction`)

| Action | When | Produced from | Honesty rule |
|---|---|---|---|
| **Use CV variant X** | Best CV differs from the default, or a variant covers more literal must-haves | `best_cv` (`cv-fit/score.ts:163`) | — |
| **Add keyword K (you have it in …)** | Term is "addable honestly" (§3.3) | Ready evidence line (`match/evidence.ts`) | Only for ready evidence. Domain-only items are offered in design wording. Never for missing terms. |
| **Write the acronym and the expansion** | JD uses "ZATCA"/"CI/CD"/"REST", the CV uses the other form | Term spellings | — |
| **Prepare answers** | Each eligibility `unknown` / `at_risk`: visa status, notice, relocation, salary expectation, degree/attestation, years in X, language | Stage (a) checks plus `lib/apply/application-facts.ts:104` (`applicationFacts`, which already formats visa/notice/relocation/CTC per region) | Answers come from the user's own facts. lee never claims an attestation or a visa the user has not set. |
| **Ask for a referral** | `referralHint` finds a connection | `connections.ts:49` | — |
| **Apply direct / via the agency** | An agency posting that names the employer → direct; an unnamed employer → the agency; a GCC in-country preference → a reputable agency or a visit | Channel detector | Scam Shield's Gulf agency-fee rules still apply (`lib/scam/rules/gulf.ts`) |
| **Quantify bullets** | Recruiter impact at risk | CV Score impact findings | Numbers only from the user. lee asks; it never invents. |
| **Study K** | Missing must-have | Existing study list | — |

These actions feed the Prepare flow's existing steps (`lib/apply/prepare.ts`: variant → tailor → cover → checklist). The tailor step (`lib/cv-fit/tailor`, fact-locked) receives the "addable honestly" terms as **priority terms**, so the tailored CV puts them first. The checklist (`lib/apply/checklist.ts:110`) gets a "Likely screening questions" group built from stage (a).

---

## 5. CV side

### 5.1 ATS-safe checks for lee's LaTeX output

lee's variant renderer (`lib/variants/latex.ts`, `lib/variants/latex-classic.ts`) is already single column, uses standard section names, keeps contact details in the body (not in `fancyhdr` headers) and uses no tables or icons. That is the right base. Found while reading it:

1. **No `glyphtounicode`.** `latex.ts:27-50` (preamble) loads `fontenc` T1 and `lmodern`, but not `\input{glyphtounicode}` and `\pdfgentounicode=1`. Neither does `latex-classic.ts`. The bundled `cv-classic.tex:35-36` template does. Without them, ligatures (fi, fl, ffi) and some glyphs can extract as missing or odd characters ("Certiﬁed", "workﬂow"). That breaks exact-term search for words like "certified", "workflow" and "profile". **Fix:** add both lines when the engine is pdfLaTeX (S). Verify by extracting text from the compiled PDF in a test (`pdftotext` or pdf.js) and asserting "certified" and "workflow" are found.
2. **The photo layout uses `minipage`** (`latex.ts:72-81`). It is fine for most parsers, but name and contact sit in a side-by-side box. Keep the name/contact block first in reading order (it already is) and add a test that the extracted text starts with the name.
3. **Dates.** Dates are rendered as "Mon YYYY – Present" (`variants/render.ts:88-95`), right-aligned with `\hfill` on the title line. Parsers read this, but some read "Present" only with an en dash or a hyphen. Keep "–" and test that extraction yields `Jan 2023 – Present`.
4. **The GCC preset defaults to the `brand` template** (`variants/presets.ts:44`). It is the same structure plus colour, which is ATS-safe. Keep it, but show "ATS-safe" on all three templates and warn on any **uploaded** custom template from `lib/latex/templates` that uses `multicol`, `tabular` layout, `fontawesome` icons or `fancyhdr` contact (the `cv-deedy`, `altacv` and `friggeri` styles are two-column). This is a lint rule in `lib/latex/lint.ts`.
5. **Photo / DOB / nationality.** These are region-correct already (`presets.ts:57-61` locks them off for remote/India). Keep this.
6. **File type.** Send PDF generated from text (lee's PDFs are). For Taleo/older portals that ask for .docx, `lib/docx` exists; note it in the checklist when the apply host is a known legacy ATS.

### 5.2 Keyword coverage per JD

Keyword coverage is stage (b), shown in Prepare step 1 (variant) as "covers 6/8 must-haves verbatim", with the "addable" list. It replaces the vague "Best CV … (fit 30)" (review P1-13) with a concrete number of terms.

### 5.3 Title alignment within truthful bounds

The **headline** may mirror the JD's title family when the user's work supports it. "Backend Developer (PHP/Laravel, Payments)" is fine for a "Backend Engineer" ad. Tailoring already rewrites the headline from facts only (`lib/cv-fit/tailor/summary.ts`, applied at `tailor/apply.ts:77`).

Job **titles in the work history stay exactly as held**. Background and employment checks compare titles and dates, and GCC visa and attestation paperwork carries the employer's letter. Tailoring may add a bracketed clarifier only when it is a true description: "Software Engineer (Backend, payments)".

Today the tailor plan never edits `work[].position` (it reads the position only as context, `tailor/ai.ts:30`). The fact-lock (`lib/resume/fact-lock.ts`) guards numbers in highlights, not titles. **Add** a guard and a test that a tailored variant's positions, employers and dates equal the master's.

---

## 6. Learning from outcomes

### 6.1 Data model

lee already has most of the events: `activities.kind = 'status_change' {from, to}`, `applications.appliedAt`, `referredByContactId`, `source`, `interview_stages`. What is missing is (1) the score **as it was** when the user applied, (2) the channel and (3) an explicit ghosted/no-response outcome. Proposal: one append-only table plus one column.

```ts
// lib/db/schema-apply.ts (new table)
export const applicationScreens = pgTable('application_screens', {
  applicationId: uuid('application_id').primaryKey().references(() => applications.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  discoveryId: uuid('discovery_id'),                 // no FK (retention prunes discoveries)
  matchVersion: text('match_version').notNull(),     // MATCH_SCORE_VERSION at apply time
  fit: smallint('fit'), match: smallint('match'), ai: smallint('ai'),
  path: jsonb('path').notNull(),                     // ScreeningPath: stage statuses + scores only (≤ 1 KB)
  variantId: uuid('variant_id'),                     // CV actually sent
  channel: text('channel').notNull(),                // 'direct_ats' | 'company_site' | 'easy_apply' | 'job_board' | 'agency' | 'referral' | 'email' | 'walk_in'
  region: text('region'),                            // 'ae' | 'kw' | 'gcc' | 'in' | 'remote'
  sourceKind: text('source_kind'),                   // discovery source kind (greenhouse, email_alert, bayt...)
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
  // Furthest stage reached, derived nightly from status_change + interview_stages:
  reached: text('reached').notNull().default('applied'), // 'applied' | 'screen' | 'interview' | 'offer'
  outcome: text('outcome'),                          // null (open) | 'rejected' | 'ghosted' | 'withdrawn' | 'offer'
  outcomeAt: timestamp('outcome_at', { withTimezone: true }),
  rejectedAfter: text('rejected_after'),             // the status the rejection came from ('applied' = ATS/recruiter reject)
})
```

- Written on "Mark applied" (`lib/apply/applied.ts`), in the same transaction as the status change.
- `ghosted` is set nightly by the retention cron (there is no new cron slot) when `reached = 'applied'` and there has been no activity for **21 days** (India/remote) or **30 days** (GCC). Both thresholds are settings. A later reply clears it.
- `rejectedAfter` is taken from the `from` of the `status_change` to `rejected`.
- Snapshot discipline: store stage statuses and scores only, never JD text. The path is about 1 KB.

### 6.2 Calibration from outcomes (small-n honest)

One user will have tens of applications, not thousands, so the learning has to be honest about small samples.

1. **Report first.** Per region × channel × band, show *applied → screen* and *screen → interview* rates as counts with a Beta(1,1) interval: "UAE · direct ATS · Good: 1 / 14 screens (2–30%)". This goes on the analytics page and replaces "calibration of the AI score only" (`lib/analytics/service.ts:258-281`).
2. **Stage-blame.** For rejections and ghosts at `applied`, count which stage was `at_risk`/`fail` at apply time. Example: "8 of 9 no-response UAE applications had eligibility 'unknown: sponsorship'". That points at the cause (in-country preference) rather than the CV.
3. **Weights.** When n ≥ 30 applications with outcomes, fit a logistic regression of `reached ≥ screen` on the stage scores plus region and channel dummies. Use L2 regularisation toward the hand-set exponents (0.35/0.35/0.30) and the research priors (§1). It is the review's §1.10 step 4, applied to stages instead of components. Use it to **propose** exponent changes as a diff the user accepts. It never changes the scores silently.
4. **Priors.** Before data exists, use the cited base rates (§1) as priors for the odds stage: cold application vs referral, and early vs late posting.

### 6.3 Calibration eval with stage labels

Extend the 156-case set on `fix/fit-eligibility-ceiling` (`tests/eval/calibration-cases.ts`, interface `CalibrationCase`):

```ts
interface CalibrationCase {
  id: string; slice: Slice; job: CalibrationJob; expect: readonly Band[]
  /** New, optional: the stage a screener would stop at, per profile. */
  expectStages?: Partial<Record<'eligibility' | 'ats' | 'recruiter' | 'manager', StageStatus | readonly StageStatus[]>>
}
```

- Label about 60 cases first: all 20 eligibility traps, 15 stretch, 15 on-target and 10 thin.
- **New slice `knockout-gcc` (15 cases):**
  - "must hold a transferable visa";
  - "immediate joiners in UAE only";
  - "attested degree required";
  - "Kuwaiti nationals and GCC";
  - "UAE driving licence required";
  - "valid Saudi iqama";
  - "visit visa holders welcome" (at risk, not fail);
  - "BE/BTech mandatory";
  - "Software Programmer – Muscat" (Oman expat ban from 2026, fail);
  - "Software Engineer – Kuwait" (KSE title, at risk);
  - "minimum 5 years Laravel" against a profile with 2 years.
- Metrics (in `tests/eval/discovery-calibration.ts`):
  - **knockout recall** = 100% (every labelled fail is `fail`);
  - **knockout precision** ≥ 90%;
  - **stage agreement** ≥ 80%;
  - the existing band agreement and non-tech false-pass thresholds stay.
- A monotonic pair set:
  - adding a must-have term to the variant never lowers stage (b);
  - marking the degree attested never lowers (a);
  - one more relevant year never lowers (c).

---

## 7. Map to code: change versus add

| # | What | Change / Add | Where |
|---|---|---|---|
| 1 | `ScreeningPath` types | Add | `lib/discovery/match/types.ts` (`MatchDetail` gets optional `screen?: ScreeningPath`, `types.ts:45-63`) |
| 2 | Stage (a) eligibility checks | Add, reusing detectors | **new** `lib/discovery/match/screen/eligibility.ts`; reuses `relevance/signals.ts:217-260`, m5 `regionFit`, `match/signals.ts:58` (language) |
| 3 | Split presence-required into hard ("must hold a transferable visa/iqama", "own visa") and soft ("in-country preferred", "immediate joiner in UAE") | Change | `relevance/signals.ts:116-125` (two arrays); `detectPresenceRequired` keeps its signature for the gate |
| 4 | Notice / immediate-joiner, degree-mandatory, attestation, licence detectors; profession-ban table (Oman); KSE/SCE "Engineer" title check | Add | `relevance/signals.ts` (new exports) + `match/jd.ts` `workAuthOf` (`jd.ts:146`) to list them |
| 5 | `degreeAttested`, optional `industry` per work item | Add | `relevance/discovery-prefs.ts` schema (`:139-180`); `lib/resume/types.ts` work item |
| 6 | Stage (b) literal keyword coverage against a variant | Add | **new** `lib/discovery/match/screen/ats.ts`; reads `VariantEvidence` (`lib/cv-fit/evidence.ts`), `extractRequirements` (`match/requirements.ts:53`), `readyEvidence` (`match/evidence.ts`) |
| 7 | JD term spelling kept alongside the canonical form | Change | `match/jd.ts` `JdLine.skills` gets `spellings` (or `match/lexicon.ts` `skillsInText` returns the matched alias) |
| 8 | Stage (c) recruiter: title alignment, `relevantYears`, impact | Add | **new** `lib/discovery/match/screen/recruiter.ts`; `cv-score/career.ts` (`experienceMonths`), `cv-score/dimensions/impact.ts` |
| 9 | Stage (d) manager: readiness-split requirement credit | Change | `match/coverage.ts:51-70` (`checkLine` returns `readiness: 'interview' \| 'domain'`) |
| 10 | Stage (e) odds: age, referral, channel, agency detector | Add | **new** `lib/discovery/match/screen/odds.ts` (server part for `referralHint`); agency regex beside `apply/checklist.ts:41` |
| 11 | Compose the path; ceilings from stages | Change | `match/score.ts:45-75` (`computeMatch` builds `screen`); m5 `ceilingOf` takes stage fails |
| 12 | Geometric combination; visa/region/mode as gate + preference | Change (P1) | `match/score.ts:63`; `match/signals.ts:100` (visa leaves the sum); `match/region.ts:58` (in/out + preference); `match/fit.ts:131` (work mode ±) |
| 13 | Version bump | Change | `match/version.ts` (m6 after m5 lands) |
| 14 | UI: screening path in "Why this score", first-risk chip on cards | Change | `components/discovery/match-why.tsx`, `components/discoveries-board.tsx`, `components/discovery-row.tsx` |
| 15 | Prepare: variant coverage, addable keywords as tailor priority terms, likely-questions group | Change | `lib/apply/prepare.ts:92,124`, `lib/apply/checklist.ts:110`, `lib/cv-fit/tailor/*` |
| 16 | LaTeX `glyphtounicode`; extraction test; template lint | Change | `lib/variants/latex.ts:27-50`, `lib/variants/latex-classic.ts`, `lib/latex/lint.ts` |
| 17 | `application_screens` table; write on Mark applied; nightly `reached/outcome/ghosted` | Add | `lib/db/schema-apply.ts`, migration, `lib/apply/applied.ts`, retention cron |
| 18 | Analytics by stage × region × channel | Change | `lib/analytics/service.ts` (calibration section `:258-281`) |
| 19 | Eval `expectStages`, `knockout-gcc` slice, stage metrics | Change | `tests/eval/calibration-cases.ts`, `tests/eval/discovery-calibration.ts` (branch) |
| 20 | Docs | Change | `docs/match-score.md` (the screening path, ceilings, bands) |

Dependency on in-progress work: items 11 to 13 land **after** `fix/fit-eligibility-ceiling` (m5) merges and after the role-ceiling work. Item 19 lands on top of the branch's eval.

---

## 8. Phased plan

Effort: S ≤ ½ day, M 1–2 days, L > 2 days (agent days).

### P0: Phase 1, shippable in about one agent-day. Explain first, no score change.

Goal: every posting shows a correct screening path and concrete actions. Fit numbers do not move, so P0 cannot conflict with m5 or the role-ceiling work.

| Task | Size | Files |
|---|---|---|
| `ScreeningPath` types; `screen/eligibility.ts` built only from existing detectors plus two new regexes (immediate joiner / notice ask; degree mandatory) and the Oman profession-ban row; known/unknown/at risk/fail | S | items 1, 2, 4 (partial) |
| `screen/ats.ts` **profile-level** version: literal JD must-have terms vs the best-CV variant's evidence when `best_cv` exists, else the profile's ready skills; produces the "addable honestly" vs "missing" lists | S | item 6 (no new storage: computed when the sheet opens, from `discoveries.best_cv` and the parsed JD) |
| `screen/recruiter.ts`: title alignment (most recent title vs JD family) and seniority status from the existing component; `relevantYears` with recency weights | S | item 8 |
| Manager stage from the existing requirement checks, split by readiness (read-only; no change to `checkLine`'s scoring) | S | item 9 (read-only variant) |
| Odds: posting age, `referralHint`, `applyChannel` | S | item 10 (no agency detector yet) |
| "Why this score": a Screening-path block with the "Next" actions; card chip = first non-pass stage | S | item 14 |
| LaTeX `glyphtounicode` in the `ats`/`brand`/`classic` variant preambles, with a compile-and-extract test | S | item 16 (first half) |
| Tests: unit tests per stage (about 40 cases, written first); 20 `expectStages` labels on existing eligibility cases, reported but not gating | S | item 19 (partial) |

Computing the path on read (in the server component that loads the sheet), not storing it, keeps P0 free of migrations and of `fit_key` and backfill churn.

### P1: make the score follow the funnel (about 3–5 agent-days)

| Task | Size |
|---|---|
| Store `screen` in `fit_detail`; Match `m6`; stage ceilings ATS 45 and relevant years 54; eligibility reasons extended into m5's ceiling | M |
| Geometric combination (§3.7); visa, region and mode out of the additive sum; starred regions to odds and shortlist only; recalibrate against the eval | M |
| Split presence-required into hard and soft; attestation pref; licence/certification-mandatory detector; agency detector | S |
| `application_screens` table, the Mark-applied write, nightly reached/outcome/ghosted | M |
| Prepare: variant coverage numbers, addable terms as tailor priority terms, a "likely screening questions" checklist group from stage (a) | M |
| Eval: `knockout-gcc` slice, all 156 cases stage-labelled, knockout recall 100% gating CI | M |
| Shortlist rank reads odds instead of freshness and region points (removes geography double counting) | S |

### P2: learn and refine (ongoing)

| Task | Size |
|---|---|
| Analytics: stage × region × channel funnel with intervals; stage-blame for no-response | M |
| Per-user logistic fit at n ≥ 30, proposing exponent diffs | M |
| AI prompt receives the stage results and returns per-stage views; blend takes the lower value on a large disagreement | M |
| Template lint for uploaded LaTeX (multicol, tabular layout, icons, fancyhdr contact) | S |
| Optional `industry` on work items; employer-similarity signal | S |
| .docx export hint for legacy ATS hosts (Taleo, older SuccessFactors portals) | S |

---

## 9. Open questions

1. **Sponsorship "not mentioned" in the GCC.** Is it `unknown` (0.9) or `at_risk` (0.7)? Most GCC tech ads that hire from abroad do say "visa provided". Silence often means in-country hiring. The user's own outcomes (§6.2 stage-blame) should settle it. Start at `unknown`.
2. **Being in-country.** Should lee model "I will be in the UAE on a Job Seeker visa from date X" as a profile state that turns "in-country preferred" from at risk into pass for that country and window? Research: the UAE Job Seeker visa (60/90/120 days, no sponsor, skill levels 1–3 with a degree) is the legal route. Working on a visit visa is illegal, but an employer can do a status change (§1.6). The design should **not** recommend visit-visa job hunting generically, because the rules differ by country and change often.
3. **Literal versus semantic ATS matching.** Modern ATS matching (Workday, iCIMS, LinkedIn) is increasingly semantic (§1). Should stage (b) give partial credit for close synonyms? This design counts only ATS-safe spellings to stay conservative, because lee cannot know which ATS or which search a recruiter will run. Revisit with outcome data.
4. **Degree.** The user's degree and attestation status need to be stated once. Are they already in the résumé education entries in a form `credentials` reads reliably?
5. **The AI half.** Keep the 50/50 blend after the geometric combination exists, or move the AI to a per-stage advisory role only?
6. **Ghost thresholds.** 21 days for India/remote and 30 for GCC are guesses. Check them against the user's own Gmail-matched reply times (`lib/gmail/matcher.ts`) once there is data.
7. **Agencies.** Treat a licensed GCC agency as a channel with its own odds, or as "find the employer and apply direct"? This depends on the user's experience. Agencies are also the main scam vector (Scam Shield already flags fees).
8. **Kuwait "Software Engineer" permit title.** It is unconfirmed whether this title falls under KSE scope (§1.6). Until it is confirmed, the check is `at_risk` with a question, never `fail`.
9. **Profession-ban table upkeep.** The Oman list and the nationals-only rules change yearly. Who refreshes `profession-bans.ts`, and does a stale entry (older than 12 months) degrade to `unknown`?
10. **Easy Apply volume.** No source exposes applicant counts. Is "Easy Apply / aggregator equals high volume" good enough, or should the user record applicant counts they see on LinkedIn by hand?
