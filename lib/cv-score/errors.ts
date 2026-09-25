/**
 * v12.0 — domain error for CV scoring. `message` is always safe to show the
 * user; API routes map `status` straight onto the HTTP response.
 */
export class CvScoreError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'CvScoreError'
    this.code = code
    this.status = status
  }
}
