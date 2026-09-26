import { describe, expect, it } from 'vitest'
import { assessScam } from '@/lib/scam/engine'
import { spansAreVerbatim, toFields } from '@/lib/scam/text'
import type { ScamInput } from '@/lib/scam/types'

function ids(input: ScamInput): string[] {
  return assessScam(input).signals.map((s) => s.id)
}

function fires(id: string, description: string, extra: ScamInput = {}): void {
  const input = { description, ...extra }
  const res = assessScam(input)
  const sig = res.signals.find((s) => s.id === id)
  expect(sig, `${id} should fire on: ${description}`).toBeDefined()
  expect(spansAreVerbatim(toFields(input), sig!.evidence)).toBe(true)
}

function silent(id: string, description: string, extra: ScamInput = {}): void {
  expect(ids({ description, ...extra }), `${id} should NOT fire on: ${description}`).not.toContain(id)
}

describe('money signals', () => {
  it.each([
    'Pay a refundable registration fee of Rs. 1500 to confirm your seat.',
    'A security deposit of ₹5,000 is required for the laptop.',
    'Joining fee INR 2999 (one time).',
    'Training charges: 3500/- payable before induction.',
    'Candidates must pay Rs 1200 for the ID card and kit.',
    'Visa processing fee AED 2500 to be paid by the candidate.',
  ])('upfront fee fires: %s', (d) => fires('money.upfront_fee', d))

  it.each([
    'We never charge any registration fee from candidates.',
    'No joining fee. No deposits of any kind.',
    'Visa processing fee borne by the company.',
    'Registration fee: NIL.',
    'Senior engineer, competitive salary and annual bonus.',
  ])('upfront fee silent: %s', (d) => silent('money.upfront_fee', d))

  it('equipment reimbursement fires with a vendor/cheque hook', () => {
    fires(
      'money.equipment_reimbursement',
      'You will purchase your home office equipment from our approved vendor and be reimbursed after your first paycheck.',
    )
    fires(
      'money.equipment_reimbursement',
      'We will send you a check to buy a laptop and software for the role.',
    )
  })

  it('equipment reimbursement silent for an ordinary home-office stipend', () => {
    silent(
      'money.equipment_reimbursement',
      'We ship you a MacBook and offer a $500 stipend to buy equipment for your home office.',
    )
  })

  it.each([
    'Deposit the check using mobile deposit and wire the remaining balance to the vendor.',
    'Send the payment via Western Union.',
    'We will courier you a cheque for supplies.',
  ])('cheque scheme fires: %s', (d) => fires('money.cheque_cashing', d))

  it.each([
    'We run background checks on all hires.',
    'Salary credited by bank transfer monthly; no cheques.',
  ])('cheque scheme silent: %s', (d) => silent('money.cheque_cashing', d))

  it.each([
    'Buy Google Play cards and send the codes to activate your account.',
    'Deposit 50 USDT to unlock the premium task level.',
  ])('crypto/gift card fires: %s', (d) => fires('money.crypto_giftcard', d))

  it.each([
    'Build crypto wallet infrastructure in Rust for our exchange.',
    'Employees receive gift cards on work anniversaries.',
  ])('crypto/gift card silent: %s', (d) => silent('money.crypto_giftcard', d))
})

describe('identity signals', () => {
  it.each([
    'Send your Aadhaar card and PAN card on WhatsApp to proceed.',
    'Please share a scan of your passport and Emirates ID to get shortlisted.',
    'Upload a copy of your PAN number and Aadhar in the form.',
  ])('ID request fires: %s', (d) => fires('identity.id_documents', d))

  it.each([
    'Passport size photographs (2) required on the day of the walk-in.',
    'Submit your PAN card and Aadhaar at the time of joining for background verification.',
    'We will never ask for your Aadhaar or passport over chat.',
    'Must hold a valid passport with at least 6 months validity.',
  ])('ID request silent: %s', (d) => silent('identity.id_documents', d))

  it.each([
    'Share the OTP you receive to verify your registration.',
    'Provide your bank account details and IFSC code to receive the joining bonus.',
  ])('bank/OTP fires: %s', (d) => fires('identity.bank_otp', d))

  it.each([
    'Experience with credit card processing systems (PCI-DSS) required.',
    'Never share your OTP with anyone, including us.',
  ])('bank/OTP silent: %s', (d) => silent('identity.bank_otp', d))

  it('Google Form + ID fires; plain form does not', () => {
    fires('identity.form_with_id', 'Fill this Google Form with your Aadhaar number: https://forms.gle/abc123')
    silent('identity.form_with_id', 'Register interest via our Google Form: https://forms.gle/abc123')
  })
})

describe('channel signals', () => {
  it.each([
    'Contact HR on Telegram @hr_priya for details.',
    'WhatsApp only: +91 98xxxxxx10',
    'Send your CV on WhatsApp to 9876543210.',
    'Apply now: https://t.me/jobs_hr_desk',
  ])('messaging-only fires: %s', (d) => fires('channel.messaging_only', d))

  it('messaging-only fires on a wa.me apply link', () => {
    fires('channel.messaging_only', 'Great role.', { applyUrl: 'https://wa.me/971500000000' })
  })

  it.each([
    'Build WhatsApp Business API integrations with Twilio.',
    'We never contact candidates on Telegram or WhatsApp.',
  ])('messaging-only silent: %s', (d) => silent('channel.messaging_only', d))

  it.each([
    'The interview will be conducted via Telegram chat.',
    'Text-based interview on Google Hangouts.',
  ])('chat interview fires: %s', (d) => fires('channel.chat_interview', d))

  it('chat interview silent for a video call', () => {
    silent('channel.chat_interview', 'Interviews happen over Zoom video with the team.')
  })

  it.each([
    'No interview required. Direct joining!',
    'Congratulations, you have been selected for the Data Entry role.',
    '100% job guarantee after the course.',
  ])('offer without interview fires: %s', (d) => fires('channel.offer_without_interview', d))

  it('offer without interview silent for a normal process', () => {
    silent('channel.offer_without_interview', 'Process: recruiter call, technical interview, onsite interview.')
  })
})

describe('sender/domain signals', () => {
  it('free-mail recruiter claiming a known company scores higher', () => {
    const input: ScamInput = {
      company: 'Amazon',
      applyEmail: 'amazon.hr.recruit@gmail.com',
      description: 'Customer support associate.',
    }
    const sig = assessScam(input).signals.find((s) => s.id === 'sender.freemail_recruiter')
    expect(sig?.weight).toBe(40)
    expect(spansAreVerbatim(toFields(input), sig!.evidence)).toBe(true)
    expect(sig!.evidence.map((e) => e.text)).toContain('gmail.com')
  })

  it('free-mail recruiter for an unknown small company is a weak signal', () => {
    const sig = assessScam({ company: 'Sharma Traders', applyEmail: 'sharmatraders@gmail.com' }).signals.find(
      (s) => s.id === 'sender.freemail_recruiter',
    )
    expect(sig?.weight).toBe(15)
  })

  it('free-mail found inside the description counts', () => {
    fires('sender.freemail_recruiter', 'Mail your resume to infosys.careers2026@outlook.com', { company: 'Infosys' })
  })

  it('company email is not free-mail', () => {
    silent('sender.freemail_recruiter', 'Mail us at jobs@acme.com', { company: 'Acme', companyDomain: 'acme.com' })
  })

  it('lookalike apply domain for a known brand fires', () => {
    const input: ScamInput = { company: 'Tata Consultancy Services', applyUrl: 'https://tcs-careers.in/apply' }
    expect(ids(input)).toContain('sender.lookalike_domain')
  })

  it('lookalike vs the posting’s own company domain fires (typo)', () => {
    expect(ids({ company: 'Stripe', companyDomain: 'stripe.com', applyUrl: 'https://stirpe.com/jobs/1' })).toContain(
      'sender.lookalike_domain',
    )
  })

  it('same-site subdomain is not a lookalike', () => {
    const got = ids({ company: 'Amazon', applyUrl: 'https://www.amazon.jobs/en/jobs/123' })
    expect(got).not.toContain('sender.lookalike_domain')
    expect(got).not.toContain('sender.apply_domain_mismatch')
  })

  it('ATS apply links never count as a mismatch', () => {
    const got = ids({
      company: 'Acme',
      companyDomain: 'acme.com',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    })
    expect(got).not.toContain('sender.apply_domain_mismatch')
  })

  it('apply link on an unrelated domain is a mismatch', () => {
    fires('sender.apply_domain_mismatch', 'Apply below.', {
      company: 'Acme',
      companyDomain: 'acme.com',
      applyUrl: 'https://quick-jobs-portal.xyz/apply?id=7',
    })
  })

  it('URL shortener apply link fires', () => {
    fires('sender.url_shortener', 'Apply at https://bit.ly/3abcXYZ now')
  })
})

describe('content signals', () => {
  it.each([
    'Earn ₹3000-₹8000 per day from home.',
    'Get Rs.500 per task, paid instantly.',
    'Make $400 a day, no experience needed.',
  ])('pay too high fires: %s', (d) => fires('content.pay_too_high', d))

  it.each([
    'Contract: $600/day for a senior Kubernetes consultant.',
    'Part-time tutor, $25 per hour.',
    'CTC 18-24 LPA.',
  ])('pay too high silent: %s', (d) => silent('content.pay_too_high', d))

  it.each([
    'No experience needed! Work from home and earn daily payouts.',
    'Housewives and students: earn ₹2000 per day in your spare time.',
  ])('easy money fires: %s', (d) => fires('content.easy_money', d))

  it('easy money silent for a normal remote job', () => {
    silent('content.easy_money', 'Remote-first team. Salary paid monthly. 5+ years experience.')
  })

  it.each([
    'Simply like YouTube videos and get paid.',
    'Rate hotels on our platform and earn commission per task.',
    'Complete 40 product optimization tasks a day.',
    'Optimize 30 products daily to earn.',
  ])('task scheme fires: %s', (d) => fires('content.task_scheme', d))

  it.each([
    'Own App Store Optimization (ASO) and growth experiments.',
    'Improve product performance and conversion with the data team.',
  ])('task scheme silent: %s', (d) => silent('content.task_scheme', d))

  it.each([
    'Limited slots! Respond within 2 hours to confirm.',
    'Urgent hiring — act fast.',
  ])('urgency fires: %s', (d) => fires('content.urgency', d))

  it('urgency silent for a normal closing date', () => {
    silent('content.urgency', 'Applications close on 30 October.')
  })

  it.each([
    'Simple copy-paste work. Just need a smartphone.',
    'Easy online job, no targets.',
  ])('vague duties fires: %s', (d) => fires('content.vague_duties', d))

  it('vague duties silent for concrete responsibilities', () => {
    silent('content.vague_duties', 'Own the billing service: design APIs, write tests, run on-call.')
  })
})
