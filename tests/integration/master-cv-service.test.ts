import { describe, it, expect } from 'vitest'
import { getMasterCV, saveMasterCV, bootstrapFromProfile } from '@/lib/documents/master'
import * as profileQ from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'
import type { MasterCV } from '@/lib/documents/types'

function makeCv(name = 'Ada'): MasterCV {
  return {
    basics: { name, headline: 'Engineer' },
    summary: 'Ships things.',
    experience: [
      {
        company: 'Acme',
        role: 'Eng',
        start: '2020-01',
        end: 'present',
        bullets: ['did work'],
      },
    ],
    skills: { primary: ['ts', 'node'] },
  }
}

describe('master CV service', () => {
  it('getMasterCV returns null when nothing saved', async () => {
    const u = await makeUser('m-null@x.com')
    expect(await getMasterCV(u.id)).toBeNull()
  })

  it('saveMasterCV persists and getMasterCV round-trips', async () => {
    const u = await makeUser('m-rt@x.com')
    const cv = makeCv('Round')
    await saveMasterCV(u.id, cv)
    const loaded = await getMasterCV(u.id)
    expect(loaded?.basics.name).toBe('Round')
    expect(loaded?.skills.primary).toContain('ts')
  })

  it('saveMasterCV increments version', async () => {
    const u = await makeUser('m-ver@x.com')
    const first = await saveMasterCV(u.id, makeCv('v1'))
    const second = await saveMasterCV(u.id, makeCv('v2'))
    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    const loaded = await getMasterCV(u.id)
    expect(loaded?.basics.name).toBe('v2')
  })

  it('bootstrapFromProfile builds a starter CV from user_profile', async () => {
    const u = await makeUser('m-boot@x.com')
    await profileQ.upsert(u.id, {
      headline: 'Senior Backend Engineer',
      summaryMd: 'A summary',
      skills: ['ts', 'go', 'sql', 'k8s', 'docker', 'grpc', 'kafka', 'redis', 'aws'],
    })
    const cv = await bootstrapFromProfile(u.id)
    expect(cv.basics.headline).toBe('Senior Backend Engineer')
    expect(cv.summary).toBe('A summary')
    expect(cv.skills.primary).toHaveLength(8)
    expect(cv.skills.secondary).toContain('aws')
  })

  it('bootstrapFromProfile handles missing profile', async () => {
    const u = await makeUser('m-boot2@x.com')
    const cv = await bootstrapFromProfile(u.id)
    expect(cv.basics.headline).toBe('Software Engineer')
    expect(cv.experience).toEqual([])
  })
})
