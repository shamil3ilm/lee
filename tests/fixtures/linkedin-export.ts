import { strToU8, zipSync } from 'fflate'

/**
 * A synthetic LinkedIn "Get a copy of your data" archive with the real file
 * names and header rows (Connections.csv starts with LinkedIn's "Notes:"
 * preamble). No real person's data.
 */

export const EXPORT_CSVS: Record<string, string> = {
  'Profile.csv': [
    'First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers',
    'Asha,Menon,,,,"Backend Engineer | Go, PostgreSQL","Backend engineer building payment and ledger systems.",Software Development,,"Dubai, United Arab Emirates",,[PORTFOLIO:https://asha.example.dev],',
  ].join('\r\n'),
  'Positions.csv': [
    'Company Name,Title,Description,Location,Started On,Finished On',
    'PayFlow,Backend Engineer,"Payments platform.\n- Designed an idempotent payouts API in Go handling 2M+ requests per day.\n- Led the ledger migration to PostgreSQL.","Dubai, United Arab Emirates",Apr 2021,',
    'Gulf Fintech,Software Engineer,"Built merchant onboarding.",Riyadh,Jan 2017,Dec 2017',
  ].join('\r\n'),
  'Education.csv': ['School Name,Start Date,End Date,Notes,Degree Name,Activities', 'Example Institute of Technology,2014,2018,,B.Tech,', 'Example Business School,2019,2020,,MBA,'].join('\n'),
  'Skills.csv': ['Name', 'Go', 'PostgreSQL', 'Laravel', 'Kafka'].join('\n'),
  'Certifications.csv': ['Name,Url,Authority,Started On,Finished On,License Number', 'AWS Certified Developer,,Amazon Web Services,Jun 2022,,', 'CKA,https://example.org/cka,The Linux Foundation,Mar 2024,,'].join('\n'),
  'Projects.csv': ['Title,Description,Url,Started On,Finished On', 'Open Ledger,Double-entry ledger library,https://github.com/example-asha/open-ledger,2022,', 'ZATCA Toolkit,E-invoicing helpers,,Jan 2024,Mar 2024'].join('\n'),
  'Languages.csv': ['Name,Proficiency', 'English,Full professional proficiency', 'Malayalam,Native or bilingual proficiency'].join('\n'),
  'Connections.csv': [
    'Notes:',
    '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more here https://www.linkedin.com/help/linkedin/answer/261"',
    '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Rami,Example,https://www.linkedin.com/in/rami-example,,Careem,Engineering Manager,15 Mar 2023',
    'Noor,Example,https://www.linkedin.com/in/noor-example,noor@example.com,Careem Networks FZ-LLC,Technical Recruiter,02 Jan 2024',
    'Omar,Example,https://www.linkedin.com/in/omar-example,,Talabat,Backend Engineer,20 Feb 2022',
  ].join('\n'),
}

export function syntheticExportZip(files: Record<string, string> = EXPORT_CSVS, prefix = ''): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [`${prefix}${name}`, strToU8(text)])))
}
