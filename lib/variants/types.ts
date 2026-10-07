import { z } from 'zod'
import { idSchema } from '@/lib/resume/types'

/**
 * A résumé variant is a RECIPE over the master profile — it holds no
 * facts. It says which master items and highlights are included, in which
 * order, which fact-locked wording each highlight uses, the headline and
 * summary, the section order, the length target, the template and which
 * region fields show. Stored per version in resume_variant_versions.recipe.
 */

export const REGIONS = ['gcc', 'india', 'remote'] as const
export type Region = (typeof REGIONS)[number]
export const REGION_LABELS: Readonly<Record<Region, string>> = {
  gcc: 'GCC',
  india: 'India',
  remote: 'Remote / US / EU',
}

export function isRegion(v: unknown): v is Region {
  return typeof v === 'string' && (REGIONS as readonly string[]).includes(v)
}

export const TEMPLATES = ['ats', 'brand', 'classic'] as const
export type VariantTemplate = (typeof TEMPLATES)[number]
export const TEMPLATE_LABELS: Readonly<Record<VariantTemplate, string>> = {
  ats: 'ATS-plain (single column)',
  brand: 'Designed (lee brand colours)',
  classic: 'Classic (Charter, ruled sections, dates on the right)',
}

export const SECTION_KEYS = ['summary', 'work', 'projects', 'skills', 'education', 'languages', 'certificates'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]
export const SECTION_LABELS: Readonly<Record<SectionKey, string>> = {
  summary: 'Summary',
  work: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  languages: 'Languages',
  certificates: 'Certifications',
}

export const REGION_FIELDS = [
  'phone',
  'location',
  'nationality',
  'visaStatus',
  'noticePeriod',
  'expectedSalary',
  'photo',
  'dateOfBirth',
  'maritalStatus',
] as const
export type RegionField = (typeof REGION_FIELDS)[number]
export const REGION_FIELD_LABELS: Readonly<Record<RegionField, string>> = {
  phone: 'Phone (with country code)',
  location: 'Location',
  nationality: 'Nationality',
  visaStatus: 'Visa status',
  noticePeriod: 'Notice period',
  expectedSalary: 'Expected salary / CTC',
  photo: 'Photo',
  dateOfBirth: 'Date of birth',
  maritalStatus: 'Marital status',
}

const highlightPick = z.object({ id: idSchema, wordingId: idSchema.nullable().default(null) })
export type HighlightPick = z.infer<typeof highlightPick>

const itemPick = z.object({ id: idSchema, highlights: z.array(highlightPick).max(30).default([]) })
export type ItemPick = z.infer<typeof itemPick>

const fieldsSchema = z.object(
  Object.fromEntries(REGION_FIELDS.map((f) => [f, z.boolean().default(false)])) as Record<
    RegionField,
    z.ZodDefault<z.ZodBoolean>
  >,
)
export type RegionFields = z.infer<typeof fieldsSchema>

export const recipeSchema = z.object({
  region: z.enum(REGIONS),
  roleFamily: z.string().max(40).nullable().default(null),
  headline: z.string().trim().max(200).default(''),
  summary: z.string().trim().max(2000).default(''),
  /** Included sections, in order. */
  sections: z.array(z.enum(SECTION_KEYS)).max(SECTION_KEYS.length).default([...SECTION_KEYS]),
  work: z.array(itemPick).max(40).default([]),
  projects: z.array(itemPick).max(40).default([]),
  /** Individual skill ids, in order. */
  skills: z.array(idSchema).max(80).default([]),
  education: z.array(idSchema).max(20).default([]),
  languages: z.array(idSchema).max(20).default([]),
  certificates: z.array(idSchema).max(40).default([]),
  /**
   * Not-ready `ai_assisted` items this variant includes ANYWAY (explicit
   * per-variant override; shown with "you may be asked about this").
   */
  overrides: z.array(idSchema).max(40).default([]),
  lengthTarget: z.union([z.literal(1), z.literal(2)]).default(1),
  template: z.enum(TEMPLATES).default('ats'),
  fields: fieldsSchema.default(fieldsSchema.parse({})),
})
export type Recipe = z.infer<typeof recipeSchema>

export function parseRecipe(value: unknown): Recipe {
  return recipeSchema.parse(value)
}
