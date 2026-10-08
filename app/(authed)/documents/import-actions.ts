'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { compileSettingsSchema, DEFAULT_COMPILE_SETTINGS } from '@/lib/latex/compile-settings'
import { MAIN_FILE } from '@/lib/latex/file-kinds'
import { MAX_MAIN_FILE_BYTES } from '@/lib/latex/project/limits'
import { isSafeProjectPath } from '@/lib/latex/project/paths'
import { logger } from '@/lib/logger'

// Server half of "Import project (.zip)". The browser unzips and validates
// the archive and uploads every other file as a document asset (one request
// per file, under the function body limit); these actions only create or
// update the document row that holds the main file.

const mainFileSchema = z
  .string()
  .max(100)
  .refine((p) => isSafeProjectPath(p), 'Invalid main file path.')

const settingsSchema = compileSettingsSchema.partial()

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.string().max(MAX_MAIN_FILE_BYTES),
  mainFile: mainFileSchema,
  settings: settingsSchema.optional(),
})

export type ImportActionResult = { documentId: string } | { error: string }

/** Create the LaTeX document an imported project lives in. */
export async function createImportedLatexDocument(input: z.input<typeof createSchema>): Promise<ImportActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) return { error: 'The imported project could not be read.' }
    const { title, source, mainFile, settings } = parsed.data
    const version = await documentsQ.nextVersion(userId, null, 'latex_cv')
    const doc = await documentsQ.create(userId, {
      applicationId: null,
      kind: 'latex_cv',
      version,
      title,
      content: {
        source,
        compileSettings: { ...DEFAULT_COMPILE_SETTINGS, ...settings },
        ...(mainFile !== MAIN_FILE ? { mainFile } : {}),
      },
    })
    revalidatePath('/documents')
    return { documentId: doc.id }
  } catch (err) {
    logger.error('createImportedLatexDocument failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not create the document.' }
  }
}

const projectSchema = z.object({
  documentId: z.string().uuid(),
  mainFile: mainFileSchema.nullable(),
  settings: settingsSchema.optional(),
})

export type ProjectMetaResult = { success: true } | { error: string }

/**
 * "Replace project" in the editor: record the imported main file's path
 * and the preselected compiler. The source itself is saved by the editor.
 */
export async function saveImportedProjectMeta(input: z.input<typeof projectSchema>): Promise<ProjectMetaResult> {
  try {
    const userId = await requireUserId()
    const parsed = projectSchema.safeParse(input)
    if (!parsed.success) return { error: 'Invalid project settings.' }
    const doc = await documentsQ.getById(userId, parsed.data.documentId)
    if (!doc || (doc.kind !== 'latex_cv' && doc.kind !== 'latex_cover_letter')) return { error: 'Not found.' }
    const existing = latexDocumentContentSchema.safeParse(doc.content)
    const base = existing.success ? existing.data : { source: '' }
    const { mainFile: _old, ...rest } = base
    void _old
    const mainFile = parsed.data.mainFile && parsed.data.mainFile !== MAIN_FILE ? parsed.data.mainFile : undefined
    const compileSettings = parsed.data.settings
      ? { ...DEFAULT_COMPILE_SETTINGS, ...rest.compileSettings, ...parsed.data.settings }
      : rest.compileSettings
    await documentsQ.update(userId, doc.id, {
      content: { ...rest, ...(compileSettings ? { compileSettings } : {}), ...(mainFile ? { mainFile } : {}) },
    })
    return { success: true }
  } catch (err) {
    logger.error('saveImportedProjectMeta failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the project settings.' }
  }
}
