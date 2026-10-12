/**
 * The Match calibration set: about 150 SYNTHETIC postings (no real employer
 * text; GCC company names are only the style of wording), each labelled with
 * the bands it may land in BEFORE running the scorer. Labels are bands, not
 * points: "strong" 75+, "good" 55–74, "fair" 35–54, "weak" < 35, and "out"
 * = not in New (filtered, or "Needs a look").
 *
 * Slices (review 2026-10-10 §1.10):
 *   ontarget-gcc 30 · ontarget-india-remote 20 · stretch 15 · adjacent 15 ·
 *   nontech 30 (+ 10 boilerplate traps) · eligibility 20 · thin 10 ·
 *   university (BambooHR-style) 6, AIU Kuwait (BambooHR, Jahrah) 8.
 */

export type Band = 'strong' | 'good' | 'fair' | 'weak' | 'out'

export type Slice =
  | 'ontarget-gcc'
  | 'ontarget-india-remote'
  | 'stretch'
  | 'adjacent'
  | 'nontech'
  | 'boilerplate'
  | 'eligibility'
  | 'thin'
  | 'university-tech'
  | 'university-nontech'

export interface CalibrationJob {
  title: string
  location: string
  remoteType: 'remote' | 'onsite' | 'hybrid' | 'unknown'
  descriptionMd: string
  companyName?: string
  /** BambooHR "Admin Staff (Local)": the Match Score's local-hire visa deduction (m6). */
  localHire?: boolean
}

export interface CalibrationCase {
  id: string
  slice: Slice
  job: CalibrationJob
  expect: readonly Band[]
}

const HIGH: readonly Band[] = ['strong', 'good']
const MID: readonly Band[] = ['fair', 'weak', 'out']
const LOW: readonly Band[] = ['weak', 'out']

// ── JD building blocks ─────────────────────────────────────────────────────

const LARAVEL_PAYMENTS = `## Responsibilities
- Build and maintain REST APIs in Laravel for payments and payouts
- Integrate payment gateways and handle webhooks
- Design MySQL schemas and write efficient queries
- Review code and write PHPUnit tests

## Requirements
- 2+ years of PHP and Laravel
- MySQL and REST APIs
- Git and code review`

const LARAVEL_GENERAL = `## Responsibilities
- Build features in our Laravel monolith and REST APIs
- Maintain MySQL schemas and queues
- Work with product on new modules

## Requirements
- 1–3 years of PHP and Laravel
- MySQL, REST APIs and Git`

const ZATCA_JD = `## Responsibilities
- Integrate ZATCA e-invoicing (Fatoora) clearance and reporting APIs
- Build the invoicing module in PHP/Laravel with XML (UBL) and QR codes
- Maintain MySQL schemas for invoices

## Requirements
- 2+ years of PHP and Laravel
- REST APIs and MySQL
- E-invoicing or ZATCA integration experience`

const FULLSTACK_JD = `## Responsibilities
- Build Laravel APIs and Vue.js screens for our billing product
- Maintain MySQL and Redis

## Requirements
- 2+ years of PHP/Laravel
- Vue.js, MySQL, REST APIs`

const API_JD = `## Responsibilities
- Build and run third-party API integrations and webhooks
- Own our REST API and OAuth flows in PHP
- Monitor integrations and fix failures

## Requirements
- 2+ years of PHP and REST APIs
- Webhooks, OAuth and MySQL`

const GO_SENIOR = `## Requirements
- 5+ years of backend engineering
- Go, Kafka and Kubernetes
- PostgreSQL and gRPC`

const JAVA_SENIOR = `## Requirements
- 6+ years of Java and Spring Boot
- Microservices, Kafka
- Payments experience is a plus`

const NODE_MID = `## Requirements
- 3+ years of Node.js and TypeScript
- PostgreSQL, REST APIs
- AWS`

const FRONTEND_JD = `## Responsibilities
- Build UI components in React and TypeScript
- Own our design system with CSS and Tailwind

## Requirements
- 3+ years of React, TypeScript, HTML and CSS
- Redux and Jest`

const DEVOPS_JD = `## Requirements
- Kubernetes, Terraform and Helm
- AWS and CI/CD pipelines
- Prometheus and Grafana`

const QA_JD = `## Requirements
- Test automation with Selenium and Cypress
- API testing with Postman
- Writing test plans and bug reports`

const MOBILE_JD = `## Requirements
- 3+ years of Swift and Kotlin
- iOS and Android app releases
- REST APIs`

const DATA_JD = `## Requirements
- SQL and Power BI or Tableau
- Python and pandas for analysis
- Build KPI dashboards for finance`

/** Employer boilerplate with payments words (the Careem/Tabby-style "About us"). */
const PAY_BOILERPLATE = `## About us
We are the region's everyday super app: rides, food, groceries, and payments through our wallet. Millions of customers pay, send money and top up their wallet with us.

## Benefits
- Wallet credits every month
- Health insurance and annual flights`

// Non-tech JDs that name generic business words (Excel, KPIs, SQL "a plus").
const OPS_JD = `## Responsibilities
- Manage day-to-day operations for partner shops and restaurants
- Track KPIs and prepare weekly reports in Excel
- Coordinate with partners to resolve escalations
- SQL is a plus

## Requirements
- 2+ years in operations
- Strong Excel skills`

const CATEGORY_JD = `## Responsibilities
- Own the category assortment, pricing and promotions
- Negotiate with suppliers and brands
- Track sales KPIs and build reports in Excel

## Requirements
- 2+ years in category management or buying
- Advanced Excel`

const TRAINING_JD = `## Responsibilities
- Deliver training to new captains and support agents
- Run quality audits on calls and chats
- Report quality KPIs every week

## Requirements
- 2+ years in training or quality assurance in a contact centre`

const DESIGN_JD = `## Responsibilities
- Lead user research and design flows in Figma
- Build wireframes, mockups and prototypes
- Partner with engineers; basic SQL and Excel to read data

## Requirements
- 5+ years of product design`

const CARE_JD = `## Responsibilities
- Handle inbound calls, chats and customer complaints
- Meet CSAT and SLA targets
- Log tickets in Zendesk

## Requirements
- 1+ year in customer service`

const ACCOUNT_JD = `## Responsibilities
- Manage a portfolio of merchant accounts and grow revenue
- Run quarterly business reviews with Excel reports
- Upsell new products

## Requirements
- 2+ years in account management`

const STRATEGY_JD = `## Responsibilities
- Drive strategy and transformation projects across business units
- Build business cases and KPI reports
- Present to leadership

## Requirements
- 3+ years in consulting or strategy`

const PARTNER_JD = `## Responsibilities
- Onboard and support restaurant partners
- Track partner KPIs and resolve issues
- Run partner trainings

## Requirements
- 2+ years in partner success or account management`

const MERCH_JD = `## Responsibilities
- Plan visual merchandising and stock for stores
- Analyse sell-through reports in Excel

## Requirements
- 2+ years in merchandising`

const FLEET_JD = `## Responsibilities
- Manage the captain fleet supply and onboarding
- Track utilisation KPIs in Excel and Google Sheets
- Coordinate with vehicle partners

## Requirements
- 2+ years in operations or logistics`

const NONTECH_JDS: ReadonlyArray<readonly [string, string]> = [
  ['Operations Associate', OPS_JD],
  ['Senior Operations Associate - Shops', OPS_JD],
  ['Category Executive', CATEGORY_JD],
  ['Category Manager', CATEGORY_JD],
  ['Training & Quality Executive', TRAINING_JD],
  ['Quality Analyst - Customer Care', TRAINING_JD],
  ['Senior Product Designer', DESIGN_JD],
  ['Customer Care Executive', CARE_JD],
  ['Account Manager', ACCOUNT_JD],
  ['Strategy & Transformation Associate', STRATEGY_JD],
  ['Partner Success Manager', PARTNER_JD],
  ['Merchandiser', MERCH_JD],
  ['Fleet Operations Executive', FLEET_JD],
  ['Supply Operations Specialist', FLEET_JD],
  ['Business Operations Analyst', OPS_JD],
]

const GCC_PLACES = ['Dubai, United Arab Emirates', 'Riyadh, Saudi Arabia', 'Kuwait City, Kuwait'] as const

/** A neutral opening paragraph, so short JDs are still read as full JDs (not "title only"). */
const INTRO = `## About the role
You will join a growing team in the region and own day-to-day work in this area, working closely with colleagues across the business and with our partners.

`

function job(title: string, location: string, descriptionMd: string, remoteType: CalibrationJob['remoteType'] = 'onsite'): CalibrationJob {
  return { title, location, remoteType, descriptionMd: descriptionMd ? `${INTRO}${descriptionMd}` : '' }
}

function build(): CalibrationCase[] {
  const out: CalibrationCase[] = []
  const add = (slice: Slice, j: CalibrationJob, expect: readonly Band[]): void => {
    out.push({ id: `${slice}-${String(out.filter((c) => c.slice === slice).length + 1).padStart(2, '0')}`, slice, job: j, expect })
  }

  // On-target, GCC (30).
  const gccTitles: ReadonlyArray<readonly [string, string]> = [
    ['Laravel Developer', LARAVEL_PAYMENTS],
    ['PHP Developer', LARAVEL_GENERAL],
    ['Backend Developer (PHP/Laravel)', LARAVEL_PAYMENTS],
    ['Payments Backend Developer', LARAVEL_PAYMENTS],
    ['ZATCA Integration Developer', ZATCA_JD],
    ['Full Stack Developer (Laravel/Vue)', FULLSTACK_JD],
    ['API Integration Developer', API_JD],
    ['Junior Backend Developer', LARAVEL_GENERAL],
    ['Mid-level PHP Engineer', LARAVEL_PAYMENTS],
    ['E-invoicing Backend Developer', ZATCA_JD],
  ]
  for (const place of GCC_PLACES) for (const [t, jd] of gccTitles) add('ontarget-gcc', job(t, place, jd), HIGH)

  // On-target, India and remote (20).
  const indiaPlaces = ['Kochi, Kerala, India', 'Bengaluru, India', 'Trivandrum, India', 'Remote - India', 'Remote - Worldwide']
  const indiaTitles: ReadonlyArray<readonly [string, string]> = [
    ['Laravel Developer', LARAVEL_PAYMENTS],
    ['PHP Developer', LARAVEL_GENERAL],
    ['Backend Engineer', API_JD],
    ['Full Stack Developer', FULLSTACK_JD],
  ]
  for (const place of indiaPlaces) {
    for (const [t, jd] of indiaTitles) {
      add('ontarget-india-remote', job(t, place, jd, place.startsWith('Remote') ? 'remote' : 'onsite'), HIGH)
    }
  }

  // Stretch (15): Senior, many years, adjacent stacks.
  const stretch: ReadonlyArray<readonly [string, string]> = [
    ['Senior Backend Engineer', GO_SENIOR],
    ['Senior Java Developer', JAVA_SENIOR],
    ['Senior Backend Engineer (Node.js)', NODE_MID],
    ['Senior Go Engineer', GO_SENIOR],
    ['Staff Backend Engineer', GO_SENIOR],
  ]
  for (const place of GCC_PLACES) for (const [t, jd] of stretch) add('stretch', job(t, place, jd), MID)

  // Adjacent tech, not targeted (15).
  const adjacent: ReadonlyArray<readonly [string, string]> = [
    ['Frontend Developer', FRONTEND_JD],
    ['DevOps Engineer', DEVOPS_JD],
    ['QA Automation Engineer', QA_JD],
    ['Mobile Developer', MOBILE_JD],
    ['Data Analyst', DATA_JD],
  ]
  for (const place of GCC_PLACES) for (const [t, jd] of adjacent) add('adjacent', job(t, place, jd), ['fair', 'weak', 'out'])

  // Non-tech GCC traps (30): 15 titles × Dubai / Kuwait.
  for (const place of [GCC_PLACES[0], GCC_PLACES[2]]) for (const [t, jd] of NONTECH_JDS) add('nontech', job(t, place, jd), LOW)

  // Boilerplate traps (10): non-tech roles whose "About us" and benefits talk payments.
  for (const [t, jd] of NONTECH_JDS.slice(0, 10)) add('boilerplate', job(t, GCC_PLACES[0], `${PAY_BOILERPLATE}\n\n${jd}`), LOW)

  // Eligibility traps (20).
  const restricted: ReadonlyArray<readonly [string, string, CalibrationJob['remoteType'], string]> = [
    ['Senior Frontend Developer', 'Indonesia, Philippines, Thailand or Vietnam', 'remote', FRONTEND_JD],
    ['Backend Developer', 'Remote - Indonesia or Vietnam', 'remote', `${LARAVEL_PAYMENTS}\n\nCore hours GMT+7.`],
    ['Laravel Developer', 'Remote', 'remote', `${LARAVEL_PAYMENTS}\n\nThis role is open to candidates located in Indonesia, the Philippines or Vietnam.`],
    ['Laravel Developer', 'Remote - US only', 'remote', LARAVEL_PAYMENTS],
    ['PHP Developer', 'Remote', 'remote', `${LARAVEL_GENERAL}\n\nYou must work US time zones only.`],
    ['Backend Developer', 'Remote (Southeast Asia)', 'remote', LARAVEL_PAYMENTS],
    ['Backend Developer', 'Remote - EU', 'remote', `${LARAVEL_PAYMENTS}\n\nYou must be based in the EU.`],
    ['Laravel Developer', 'Berlin, Germany', 'onsite', `${LARAVEL_PAYMENTS}\n\nWe are unable to sponsor visas.`],
    ['PHP Developer', 'London, United Kingdom', 'onsite', `${LARAVEL_GENERAL}\n\nYou must have the right to work in the UK.`],
    ['Backend Developer', 'Toronto, Canada', 'onsite', LARAVEL_GENERAL],
    ['Laravel Developer', 'Remote - LATAM', 'remote', LARAVEL_PAYMENTS],
    ['Backend Developer', 'Singapore', 'onsite', LARAVEL_GENERAL],
    ['Backend Engineer', 'Remote - Australia', 'remote', API_JD],
    ['PHP Developer', 'Remote', 'remote', `${LARAVEL_GENERAL}\n\nWorking hours UTC-8 to UTC-5.`],
    ['Laravel Developer', 'Remote - Canada', 'remote', LARAVEL_PAYMENTS],
    ['Backend Developer', 'Manila, Philippines', 'onsite', LARAVEL_GENERAL],
    ['Backend Developer', 'Remote - Philippines', 'remote', API_JD],
    ['Laravel Developer', 'Jakarta, Indonesia', 'onsite', LARAVEL_PAYMENTS],
    ['Backend Developer', 'Remote - Brazil', 'remote', LARAVEL_GENERAL],
    ['PHP Developer', 'Remote', 'remote', `${LARAVEL_GENERAL}\n\nOnly open to residents of the United States.`],
  ]
  for (const [t, loc, mode, jd] of restricted) add('eligibility', job(t, loc, jd, mode), LOW)

  // Thin inputs (10): title only, capped at 55 (fair or the bottom of good).
  const thin = ['PHP Developer', 'Laravel Developer', 'Backend Developer', 'Software Engineer', 'Full Stack Developer']
  for (const place of [GCC_PLACES[0], 'Kochi, India']) for (const t of thin) add('thin', job(t, place, ''), ['good', 'fair'])

  // University (BambooHR-style): tech roles pass; academic and PRO roles do not reach New.
  const UNI = 'Abu Dhabi, United Arab Emirates'
  add('university-tech', job('Application Developer', UNI, `## Responsibilities\n- Build and maintain university web applications in PHP and Laravel\n- Integrate the student information system through REST APIs\n- Maintain MySQL databases\n\n## Requirements\n- 2+ years of PHP and MySQL`), ['strong', 'good', 'fair'])
  add('university-tech', job('Web Developer', UNI, `## Responsibilities\n- Develop the university website and portals\n- Build forms and integrations with PHP, JavaScript and MySQL\n\n## Requirements\n- 2+ years of web development with PHP`), ['strong', 'good', 'fair'])
  add('university-tech', job('Institutional Research Officer', UNI, `## Responsibilities\n- Build enrolment and graduation dashboards in Power BI\n- Write SQL queries against the student information system\n- Analyse survey data with Python and pandas\n\n## Requirements\n- SQL, Power BI and data analysis`), ['good', 'fair', 'weak'])
  add('university-nontech', job('Professor of Accounting', UNI, `## Responsibilities\n- Teach undergraduate accounting courses\n- Publish research and supervise students\n\n## Requirements\n- PhD in Accounting`), ['out'])
  add('university-nontech', job('Dean, College of Business', UNI, `## Responsibilities\n- Lead the college's academic programmes and faculty\n- Accreditation and strategic planning\n\n## Requirements\n- PhD and academic leadership experience`), ['out'])
  add('university-nontech', job('Mandoub', UNI, `## Responsibilities\n- Process visas, Emirates IDs and labour cards at government departments\n- Collect and deliver documents\n\n## Requirements\n- Valid UAE driving licence`), ['out'])

  // American International University, Kuwait (BambooHR, "Jahrah"; synthetic text modelled on the
  // 2026-10-12 board): the IT, web, data and AI roles reach New; academic, PRO and HR roles do not.
  const AIU = 'Jahrah, Kuwait'
  add('university-tech', { ...job('Application Developer in Informational Technology (IT)', AIU, `Location: Saad Al Abdullah, Kuwait\n\n## Job Summary\nDevelops and supports custom and enterprise applications for academic operations and student services.\n\n## Responsibilities\n- Build web applications and REST APIs with PHP and Laravel\n- Write SQL against MySQL databases\n- Integrate the student information system with internal portals\n\n## Requirements\n- 2 years of experience in web application development`), localHire: true }, ['strong', 'good', 'fair'])
  add('university-tech', job('Web Developer & Designer / SEO Specialist', AIU, `## Responsibilities\n- Develop and maintain the university website (WordPress or a custom PHP and JavaScript stack)\n- Technical SEO, analytics and performance optimisation\n- UI and accessibility improvements\n\n## Requirements\n- 3 years of experience in web development`), ['strong', 'good', 'fair'])
  add('university-tech', job('Institutional Research Officer', AIU, `## Responsibilities\n- Analyse and validate institutional data for data-driven decision making\n- Build dashboards in Power BI and write SQL queries\n- Produce statistical reports for accreditation\n\n## Requirements\n- 2 years of experience in data analysis`), ['good', 'fair', 'weak'])
  add('university-tech', job('AI Technician', AIU, `## Responsibilities\n- Support AI prototype development and data workflows in Python\n- Build automation scripts and dashboards\n- Tool testing, troubleshooting and documentation for research projects\n\n## Requirements\n- Python, SQL and data preparation`), ['good', 'fair', 'weak'])
  add('university-nontech', job('Full Professor / Associate Professor / Assistant Professor of Physics', AIU, `## Responsibilities\n- Teach undergraduate physics courses and labs\n- Lesson planning and student assessment\n- Publish research\n\n## Requirements\n- PhD in Physics`), ['out'])
  add('university-nontech', job('Dean – School of Engineering & Computing', AIU, `## Responsibilities\n- Provide academic leadership to the school and its faculty\n- Lead accreditation and curriculum development\n\n## Requirements\n- PhD and senior academic leadership`), ['out'])
  add('university-nontech', { ...job('Mandoub', AIU, `## Responsibilities\n- Handle government transactions, residency permits and licence renewals with ministries\n\n## Requirements\n- Valid Kuwaiti driving licence`), localHire: true }, ['out'])
  add('university-nontech', job('Talent Acquisition Specialist', AIU, `## Responsibilities\n- End-to-end recruitment for academic and administrative roles\n- Sourcing candidates and onboarding new hires\n\n## Requirements\n- 3 years of recruitment experience`), ['out'])
  return out
}

export const CALIBRATION_CASES: readonly CalibrationCase[] = build()

/** Slices a non-tech posting belongs to (for the false-pass rate). */
export const NON_TECH_SLICES: ReadonlySet<Slice> = new Set(['nontech', 'boilerplate', 'university-nontech'])
