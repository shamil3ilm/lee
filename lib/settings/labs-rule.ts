/**
 * The Labs default: on for the deployment owner (who built and uses the
 * lab), off for invitees, who came for the job search (review 2026-10-10
 * §1.3, "cut or hide for the beta"). Pure, client-safe.
 */
export function labsDefault(owner: boolean): boolean {
  return owner
}

/** The saved choice wins; null means "use the default". */
export function labsOn(stored: boolean | null | undefined, owner: boolean): boolean {
  return stored ?? labsDefault(owner)
}
