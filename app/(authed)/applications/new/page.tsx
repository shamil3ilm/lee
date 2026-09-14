import { addFromUrl } from './actions'

export default function NewApplicationPage() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">Add application</h1>
      <form action={addFromUrl} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm">Job posting URL</span>
          <input
            name="url"
            type="url"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="https://..."
          />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Parse and save
        </button>
      </form>
    </div>
  )
}
