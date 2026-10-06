/** Errors with a user-facing message (server actions show `message` as is). */
export class AcademyError extends Error {
  constructor(
    readonly code: 'not_found' | 'no_item' | 'retired' | 'invalid',
    message: string,
  ) {
    super(message)
    this.name = 'AcademyError'
  }
}
