/** Code-quality metrics (v13 §4.3). Client-safe. */
export interface QualityMetrics {
  /** Longest function, in lines. */
  maxFnLength: number
  /** Deepest block nesting inside any function. */
  nesting: number
  /** Decision points + 1, summed over the code (approximate for non-JS). */
  cyclomatic: number
  /** Identifiers that are too short to read (single letters outside loop counters and math). */
  namingIssues: number
  /** 'ast' when parsed (JS/TS), 'lines' for the line-based estimate (Python, PHP). */
  method: 'ast' | 'lines'
}
