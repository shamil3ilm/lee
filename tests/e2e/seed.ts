import 'dotenv/config'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(
    sql`TRUNCATE users, applications, jobs, companies, contacts, activities, interview_stages, application_contacts, user_profile, sources, discoveries, company_discoveries, ai_call_logs CASCADE`,
  )
  await db.insert(users).values({ email: process.env.ALLOWED_EMAIL!, name: 'E2E User' })
  console.log('seeded')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
