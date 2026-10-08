/** A radar error whose message is safe to show the user. */
export class RadarError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'duplicate' | 'not_found' | 'limit' = 'invalid',
  ) {
    super(message)
    this.name = 'RadarError'
  }
}
