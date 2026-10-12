/**
 * SERVER-ONLY seam: how many postings wait in "Needs a look" for a user
 * (the sidebar badge next to Discovery and the Discovery subtitle). Kept
 * separate from the New count on purpose.
 *
 * TODO(relevance): return the real count once the gate stores the review
 * disposition (see lib/ui/needs-look.ts). Zero hides every "Needs a look"
 * surface.
 */
export async function countNeedsLook(_userId: string): Promise<number> {
  return 0
}
