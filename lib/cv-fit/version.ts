/**
 * Version of the "Best CV for each job" rules (lib/cv-fit). Part of every
 * row's `best_cv_key`: bump it when a weight, the region table or the
 * evidence rules change, and the backfill recomputes stored rows.
 */
// b2 — any-of requirement groups ("Power BI or Tableau") count once.
export const BEST_CV_VERSION = 'b2'
