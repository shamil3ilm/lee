/** A reputation error whose message is safe to show the user. */
export class ReputationError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'no_signals' | 'invalid' = 'invalid',
  ) {
    super(message)
    this.name = 'ReputationError'
  }
}
