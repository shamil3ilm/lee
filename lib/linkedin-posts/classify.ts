/**
 * Deterministic hiring-intent classifier for LinkedIn post text (from the
 * user's own notification emails or text they pasted). Client-safe, no AI,
 * no I/O. Tuned on the synthetic posts in tests/fixtures/linkedin-posts for
 * PRECISION: a post is "hiring" only with at least one clear hiring phrase,
 * enough supporting signals, and no job-seeker or announcement pattern.
 *
 *   score = Σ weights of matched signals − Σ weights of matched negatives
 *   hiring = score ≥ HIRING_THRESHOLD ∧ a strong signal ∧ no seeker signal
 */

interface Signal {
  re: RegExp
  weight: number
  label: string
}

export const HIRING_THRESHOLD = 5

const ROLE_NOUN = String.raw`(?:developer|engineer|programmer|architect|devops|sre|qa|tester|designer|analyst|consultant|scientist|administrator|specialist|lead|intern)`

/** Clear hiring phrases (English and Arabic). At least one is required. */
const STRONG: readonly Signal[] = [
  { re: /\bwe(?:'re| are| r) (?:now |actively |urgently )?hiring\b/, weight: 4, label: '“We’re hiring”' },
  { re: /#(?:hiring|nowhiring|wearehiring|werehiring|jobopening|vacancy|vacancies)\b/, weight: 3, label: '#hiring hashtag' },
  { re: /\b(?:now|urgently|actively|still) hiring\b/, weight: 3, label: '“Now hiring”' },
  { re: /\b[a-z0-9&.]+ is hiring\b/, weight: 3, label: '“… is hiring”' },
  { re: /\bjoin (?:our|my|the) (?:growing |amazing |dynamic )?(?:team|squad|crew)\b/, weight: 3, label: '“Join our team”' },
  {
    re: /\b(?:send|share|drop|email|e-mail|forward|submit|mail|dm) (?:me |us )?(?:your |ur |an? |the )?(?:updated |latest )?(?:cv|cvs|resume|resumes|résumé|profile)\b/,
    weight: 3,
    label: 'Asks for your CV',
  },
  { re: /\b(?:cv|cvs|resume|resumes)\s*(?:to|at|:)\s*[a-z0-9._%+-]+@/, weight: 3, label: 'CV to an email address' },
  { re: /\b(?:open|new|current) (?:position|positions|role|roles|vacancy|vacancies|opening|openings)\b/, weight: 3, label: 'Open position' },
  { re: /\bjob (?:opening|openings|opportunity|vacancy)\b/, weight: 3, label: 'Job opening' },
  { re: /\bvacanc(?:y|ies)\b/, weight: 2, label: 'Vacancy' },
  { re: /\burgent(?:ly)? (?:requirement|opening|need|hiring|vacancy)\b|\burgent requirement\b/, weight: 3, label: 'Urgent requirement' },
  { re: new RegExp(String.raw`\b(?:we(?:'re| are)|(?:my|our) (?:team|client|company)[^.!?\n]{0,60}? (?:is|are)) (?:looking|searching) for (?:an? |two |\d+ )?(?:[a-z.+#/-]+ ){0,4}${ROLE_NOUN}s?\b`), weight: 4, label: '“We’re looking for a …”' },
  { re: new RegExp(String.raw`\bhiring (?:an? |two |\d+ )?(?:[a-z.+#/-]+ ){0,4}${ROLE_NOUN}s?\b`), weight: 3, label: 'Hiring a role' },
  { re: /\blooking to (?:hire|recruit|onboard)\b/, weight: 4, label: '“Looking to hire”' },
  { re: /\b(?:we|i) (?:have|got) (?:an? |two |\d+ )?(?:new )?(?:opening|openings|vacancy|vacancies|open roles?|open positions?)\b/, weight: 4, label: '“We have an opening”' },
  { re: /\b(?:now |actively )recruiting\b|\brecruiting (?:now|for)\b/, weight: 3, label: '“Recruiting now”' },
  { re: /مطلوب/, weight: 4, label: '“مطلوب” (wanted)' },
  { re: /توظيف/, weight: 3, label: '“توظيف” (hiring)' },
  { re: /وظ(?:يفة|ائف) شاغرة|فرص(?:ة)? عمل/, weight: 3, label: 'Arabic: job vacancy' },
  { re: /نبحث عن|انضم (?:إلى|الى) فريق/, weight: 3, label: 'Arabic: we are looking for / join our team' },
]

/** Supporting signals: never enough on their own. */
const SUPPORT: readonly Signal[] = [
  { re: /\b(?:dm|inbox|message|ping) (?:me|us)\b|\bdm (?:for|to know)\b|\bdms? (?:are )?open\b/, weight: 2, label: 'Asks for a DM' },
  { re: /\bcomment ["'“]?(?:interested|yes|cv)\b/, weight: 2, label: 'Comment “interested”' },
  { re: /\binterested (?:candidates|applicants|professionals|people)\b/, weight: 2, label: 'Interested candidates' },
  { re: /\bimmediate joiners?\b|\bjoin(?:ing)? immediately\b|\bnotice period\b/, weight: 2, label: 'Joining / notice period' },
  { re: /\b(?:position|role|job title|designation|requirement|location|experience)\s*[:\-–]/, weight: 2, label: 'Job details (Role: / Location:)' },
  { re: /#(?:jobs?|careers?|recruitment|recruiting|jobalert|jobsearch\w*|developerjobs|techjobs|uaejobs|dubaijobs|kuwaitjobs|ksajobs|qatarjobs|gccjobs)\b/, weight: 1, label: 'Job hashtag' },
  { re: /\bapply (?:now|here|via|through|at|by|using|on)\b|\bapplication link\b/, weight: 2, label: 'Apply link' },
  { re: /\b\d+\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)\b|\bexperience\s*:\s*\d/, weight: 1, label: 'Years of experience' },
  { re: new RegExp(String.raw`\b${ROLE_NOUN}s?\b`), weight: 1, label: 'Role named' },
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/, weight: 1, label: 'Contact email' },
  {
    re: /\b(?:dubai|abu dhabi|sharjah|uae|riyadh|jeddah|dammam|ksa|saudi|doha|qatar|kuwait|bahrain|manama|muscat|oman|gcc|bengaluru|bangalore|kochi|trivandrum|remote|on-?site|hybrid)\b|دبي|الرياض|الكويت|الدوحة|جدة|أبوظبي|ابوظبي/,
    weight: 1,
    label: 'Place named',
  },
]

/** A job seeker's post: never a hiring post. */
const SEEKER: readonly Signal[] = [
  { re: /#opentowork\b|\bopen to (?:work|new (?:roles|opportunities|positions))\b/, weight: 8, label: 'Open to work' },
  {
    re: /\b(?:i(?:'m| am)|i've been|currently|actively) (?:also )?(?:looking|searching|seeking|hunting) (?:for )?(?:a |an |my )?(?:new |next |full[- ]time |remote )?(?:role|job|opportunit\w*|position|challenge|opening)\b/,
    weight: 8,
    label: 'The poster is looking for a job',
  },
  { re: /\bseeking (?:new |a new |exciting )?(?:opportunit\w*|role|employment|position)\b/, weight: 8, label: 'Seeking opportunities' },
  { re: /\b(?:i was|i've been|i got|i have been|was) laid off\b|\bmy next (?:role|opportunity|chapter)\b/, weight: 8, label: 'Laid off / next chapter' },
  { re: /أبحث عن (?:عمل|وظيفة)|ابحث عن (?:عمل|وظيفة)/, weight: 8, label: 'Arabic: looking for a job' },
]

/** Posts about hiring that are not openings: announcements, advice, events. */
const NOT_AN_OPENING: readonly Signal[] = [
  { re: /\b(?:excited|happy|thrilled|pleased|proud|delighted) to (?:announce|share)\b/, weight: 3, label: 'Announcement' },
  { re: /\bstart(?:ing|ed) a new (?:position|role|job)\b|\bi(?:'ve| have) (?:just )?joined\b|\bfirst day at\b/, weight: 5, label: 'New job announcement' },
  { re: /\bwork anniversary\b|\bcongratulat\w*\b|\bcelebrat\w*\b/, weight: 3, label: 'Congratulations / anniversary' },
  { re: /\b(?:hiring|recruiting|interview) (?:tips|advice|mistakes|trends|process|lessons|red flags)\b|\bhow (?:to|we) hire\b|\b(?:learned|learnt|lessons) (?:from|about|while|in) hiring\b/, weight: 5, label: 'Advice about hiring' },
  { re: /\b(?:recruiters|hiring managers|founders)[,]? (?:please|stop|should|need to|must)\b/, weight: 5, label: 'Opinion about recruiting' },
  { re: /\bwebinar\b|\bpodcast\b|\bregister (?:now|here)\b|\bjob fair\b|\bcareer fair\b/, weight: 3, label: 'Event or webinar' },
  { re: /\b(?:position|role|vacancy) (?:is |has been )?(?:now )?(?:filled|closed)\b|\bno longer (?:hiring|accepting)\b/, weight: 6, label: 'Position filled' },
  { re: /\bnot (?:yet|hiring|currently hiring)\b|\bstay tuned\b|\bhiring soon\b/, weight: 6, label: 'Not hiring yet' },
  { re: /\bwelcome (?:our )?(?:new|newest)\b|\bwe(?:'ve| have)? (?:just )?hired\b/, weight: 4, label: 'Welcomes a new hire' },
]

export interface HiringVerdict {
  hiring: boolean
  score: number
  /** Why it reads as hiring (signal labels, strongest first). */
  reasons: string[]
  /** Why it was held back (seeker / announcement labels). */
  negatives: string[]
}

/** Lower-cased, straight quotes, single spaces; Arabic left as is. */
export function normalizePostText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[​-‏‪-‮]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function matched(text: string, signals: readonly Signal[]): Signal[] {
  return signals.filter((s) => s.re.test(text))
}

export function classifyHiringPost(raw: string): HiringVerdict {
  const text = normalizePostText(raw).slice(0, 5_000)
  const strong = matched(text, STRONG)
  const support = matched(text, SUPPORT)
  const seeker = matched(text, SEEKER)
  const other = matched(text, NOT_AN_OPENING)
  const plus = [...strong, ...support].reduce((n, s) => n + s.weight, 0)
  const minus = [...seeker, ...other].reduce((n, s) => n + s.weight, 0)
  const score = plus - minus
  return {
    hiring: strong.length > 0 && seeker.length === 0 && score >= HIRING_THRESHOLD,
    score,
    reasons: [...strong, ...support].sort((a, b) => b.weight - a.weight).map((s) => s.label),
    negatives: [...seeker, ...other].map((s) => s.label),
  }
}
