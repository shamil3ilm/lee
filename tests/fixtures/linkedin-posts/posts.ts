/**
 * SYNTHETIC LinkedIn posts for the hiring-intent classifier: invented
 * people, companies (example / .test domains) and phone-free text. Labelled
 * by hand: `hiring` = a real opening someone can act on. Tricky negatives
 * (job seekers, announcements, advice, filled roles) are deliberate.
 */

export interface LabelledPost {
  id: string
  hiring: boolean
  text: string
}

export const LABELLED_POSTS: readonly LabelledPost[] = [
  // ---- Hiring (24) --------------------------------------------------------
  { id: 'h01', hiring: true, text: "We're hiring a Laravel Developer in Dubai! 3+ years with PHP and MySQL. Send your CV to careers@dunesoft.example #hiring #dubaijobs" },
  { id: 'h02', hiring: true, text: 'Urgent requirement: PHP Developer (Laravel) for our client in Kuwait City. Immediate joiners preferred. DM me or share your resume at hr@gulfstaff.example' },
  { id: 'h03', hiring: true, text: 'My team is looking for a Backend Engineer (Node.js / Postgres) in Riyadh. Hybrid, 4+ years. Comment "interested" or DM me.' },
  { id: 'h04', hiring: true, text: 'Join our team! Example Pay is hiring a Payments Engineer in Abu Dhabi to work on card issuing and settlement. Apply here: https://careers.examplepay.example/jobs/42' },
  { id: 'h05', hiring: true, text: 'مطلوب مطور PHP Laravel للعمل في الكويت. خبرة 3 سنوات على الأقل. أرسل سيرتك الذاتية إلى jobs@kwtech.example' },
  { id: 'h06', hiring: true, text: 'Position: Full Stack Developer\nLocation: Doha, Qatar\nExperience: 2-4 years\nSend CV to talent@pearltech.example\n#hiring #qatarjobs' },
  { id: 'h07', hiring: true, text: 'We are hiring! Open positions: Senior Laravel Developer, QA Engineer. Location: Bahrain (on-site). Drop your CV in my inbox.' },
  { id: 'h08', hiring: true, text: 'Now hiring a ZATCA e-invoicing integration developer in Jeddah. Experience with Fatoora APIs is a plus. Email resumes to recruit@sandco.example' },
  { id: 'h09', hiring: true, text: 'Our client, a fintech in DIFC, is looking for a PHP Developer with payment gateway experience. Interested candidates can DM me.' },
  { id: 'h10', hiring: true, text: 'Job opening for a DevOps Engineer at Oasis Cloud, Muscat. AWS, Kubernetes, 3+ yrs exp. Apply via https://apply.oasiscloud.example/devops' },
  { id: 'h11', hiring: true, text: 'Hiring a Junior Backend Developer (PHP) — remote within the GCC. Notice period up to 30 days. Share your resume: people@miragelabs.example' },
  { id: 'h12', hiring: true, text: 'توظيف: نبحث عن مهندس برمجيات Backend في الرياض. أرسل السيرة الذاتية عبر الرسائل الخاصة.' },
  { id: 'h13', hiring: true, text: "Example Bank is hiring! We're looking for a Software Engineer (Java/Spring) in Manama. Apply now on our careers page." },
  { id: 'h14', hiring: true, text: 'Vacancy: Laravel Developer | Sharjah | AED 9,000–12,000. Interested applicants send your CV to jobs@falconit.example #vacancy #uaejobs' },
  { id: 'h15', hiring: true, text: 'We are looking for a Mid-level Full Stack Developer (Vue + Laravel) to join our team in Kochi. 2+ years. DM me for details.' },
  { id: 'h16', hiring: true, text: '#hiring Backend Developer (Go) — Dubai Internet City. Hybrid. Must have 3 years of experience. Send your updated resume to hr@harbor.example' },
  { id: 'h17', hiring: true, text: 'Still hiring for a QA Engineer in Kuwait. Experience: 2+ years with Selenium. Inbox me with your CV.' },
  { id: 'h18', hiring: true, text: 'Urgently hiring Laravel developers for a 6-month contract in Riyadh. Immediate joiners only. Email cv@desertworks.example' },
  { id: 'h19', hiring: true, text: 'Exciting job opportunity at Nakheel Digital (example): Senior Backend Engineer in Dubai. Apply here https://jobs.nakheeldigital.example/123 #jobs' },
  { id: 'h20', hiring: true, text: 'We’re hiring a Payments Integration Engineer (PHP) to work on wallets and acquiring in Doha. Join our team — send your resume to work@qpay.example' },
  { id: 'h21', hiring: true, text: 'وظيفة شاغرة: مطور ويب (PHP) في دبي. للتقديم أرسل سيرتك إلى hr@emiratesweb.example' },
  { id: 'h22', hiring: true, text: 'Open role: Data Analyst at Corniche Analytics, Abu Dhabi. Power BI and SQL, 2-3 years. Apply through the link in comments.' },
  { id: 'h23', hiring: true, text: 'My client is looking for a Laravel Team Lead in Kuwait. Package competitive. Interested candidates please send your CV to lead@talentbridge.example' },
  { id: 'h24', hiring: true, text: 'Hiring an ERP Developer (Odoo/Python) in Muscat, Oman. On-site. Share your CV via DM.' },

  // ---- Not hiring (16) ----------------------------------------------------
  { id: 'n01', hiring: false, text: "I'm looking for a new role as a Laravel Developer in Dubai. 4 years with PHP and MySQL. Please share any leads! #opentowork" },
  { id: 'n02', hiring: false, text: "Happy to share that I'm starting a new position as Backend Engineer at Example Pay in Abu Dhabi!" },
  { id: 'n03', hiring: false, text: 'Hiring tips for founders: write clear job descriptions, reply to every candidate, and never ghost after interviews.' },
  { id: 'n04', hiring: false, text: 'Recruiters, please stop asking candidates for their current salary. It helps no one. #hiring' },
  { id: 'n05', hiring: false, text: 'Congratulations to our team on 10 years of building payments in the Gulf! Celebrating with everyone in Riyadh today.' },
  { id: 'n06', hiring: false, text: 'Update: the Laravel Developer position in Dubai has been filled. Thank you to everyone who applied!' },
  { id: 'n07', hiring: false, text: 'Join our webinar on e-invoicing in Saudi Arabia (ZATCA Phase 2). Register now: https://events.example/zatca' },
  { id: 'n08', hiring: false, text: 'After 5 years at Example Bank I was laid off this week. Seeking new opportunities in backend development across the GCC.' },
  { id: 'n09', hiring: false, text: 'Just published an article on scaling Laravel queues with Redis. Would love your feedback, fellow developers!' },
  { id: 'n10', hiring: false, text: 'Welcome our newest engineer, Sara, to the Dubai team! We just hired three amazing developers this quarter.' },
  { id: 'n11', hiring: false, text: 'أبحث عن وظيفة مطور PHP في الكويت. خبرة 5 سنوات. أي ترشيحات؟' },
  { id: 'n12', hiring: false, text: 'Proud to announce we closed our Series A! Big thanks to our investors and customers across the UAE.' },
  { id: 'n13', hiring: false, text: 'The job market in Dubai is tough right now. What are you seeing in backend hiring this quarter? Interested to hear your thoughts.' },
  { id: 'n14', hiring: false, text: 'Celebrating my 3rd work anniversary at Harbor Tech as a QA Engineer. Grateful for this team!' },
  { id: 'n15', hiring: false, text: 'Visiting the career fair at Dubai World Trade Centre tomorrow. Come say hi at our booth!' },
  { id: 'n16', hiring: false, text: 'Open to work: Full Stack Developer (React, Laravel), available immediately, based in Sharjah. DM me if you know of a role.' },
]

/**
 * Held out: written after the classifier was tuned and never used to tune
 * it, so its numbers are an honest estimate (reported, not gated).
 */
export const HELD_OUT_POSTS: readonly LabelledPost[] = [
  { id: 'x01', hiring: true, text: 'Looking to hire a PHP developer for our e-commerce startup in Al Khobar. Must know Laravel and REST APIs. Message me.' },
  { id: 'x02', hiring: true, text: 'We have an opening for a Software Engineer (payments) in Dubai. Reach out at talent@sandpay.example' },
  { id: 'x03', hiring: true, text: 'Recruiting now: backend developers for a government project in Kuwait. Send CVs to projects@kwgov-it.example' },
  { id: 'x04', hiring: true, text: '#WeAreHiring Laravel Developer – Riyadh – 3 yrs. Share your resume.' },
  { id: 'x05', hiring: true, text: 'مطلوب مبرمج Laravel لشركة ناشئة في جدة' },
  { id: 'x06', hiring: false, text: 'Three things I learned from hiring 50 engineers in Dubai: speed matters, references matter, culture matters.' },
  { id: 'x07', hiring: false, text: 'Thrilled to announce I have joined Example Pay as a QA Engineer in Doha!' },
  { id: 'x08', hiring: false, text: 'Our company is hiring? Not yet, but we are growing fast in Bahrain. Stay tuned!' },
  { id: 'x09', hiring: false, text: 'Seeking a Laravel developer role in Abu Dhabi, 3 years of experience, immediate joiner. #opentowork' },
  { id: 'x10', hiring: false, text: 'Join our team at the Riyadh marathon this weekend! Register here.' },
]
