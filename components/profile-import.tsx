import { importProfileAction } from '@/app/(authed)/settings/profile/actions'

export function ProfileImport() {
  return (
    <form action={importProfileAction} className="space-y-3 rounded border p-4">
      <h2 className="font-medium">Import from CV / markdown</h2>
      <p className="text-xs text-neutral-500">
        Upload a PDF/DOCX CV and/or a markdown profile. The AI provider will parse them and update
        the profile below. Fields you did not fill will be seeded with defaults on first save.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block">CV file (.pdf, .docx, .md, .txt)</span>
        <input
          name="cv"
          type="file"
          accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          className="w-full text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Profile markdown (.md, .txt)</span>
        <input
          name="profile_md"
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          className="w-full text-sm"
        />
      </label>
      <button className="rounded bg-black px-3 py-2 text-white" type="submit">
        Parse and save
      </button>
    </form>
  )
}
