/**
 * Domain errors thrown by document generation services. Route handlers map
 * these to user-friendly messages; unknown errors get a generic response.
 */
export class MasterCVNotFoundError extends Error {
  constructor() {
    super('No master CV found. Populate /settings/cv before generating documents.')
    this.name = 'MasterCVNotFoundError'
  }
}

export class ApplicationNotFoundError extends Error {
  constructor(id: string) {
    super(`Application ${id} not found.`)
    this.name = 'ApplicationNotFoundError'
  }
}
