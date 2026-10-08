import { NotFoundView } from '@/components/errors/not-found-view'

/** `notFound()` from a signed-in page (a deleted application, a bad id): keeps the app shell. */
export default function AuthedNotFound() {
  return <NotFoundView signedIn />
}
