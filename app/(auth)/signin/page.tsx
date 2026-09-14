import { signIn } from '@/lib/auth'

export default function SignInPage() {
  return (
    <div className="mx-auto mt-32 max-w-sm text-center">
      <h1 className="mb-4 text-2xl font-semibold">Sign in to Employ</h1>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
      >
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Continue with Google
        </button>
      </form>
    </div>
  )
}
