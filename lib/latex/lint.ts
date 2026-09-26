// ---------------------------------------------------------------------------
// "Code Check" for the LaTeX editor (v17 §8.5 decision 6): a single-pass
// scanner that reports, as you type,
//   - unmatched \begin / \end,
//   - unbalanced { },
//   - unbalanced \left / \right and $ / $$ (and \( \), \[ \]),
//   - math-only commands used outside math mode.
// Pure (offsets in, issues out); the editor turns issues into CM6 diagnostics.
// Written for lee from scratch — no Overleaf code (AGPL).
// ---------------------------------------------------------------------------

export interface LintIssue {
  from: number
  to: number
  severity: 'error' | 'warning'
  message: string
}

const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment'])

const MATH_ENVS = new Set(
  [
    'equation',
    'align',
    'gather',
    'multline',
    'flalign',
    'alignat',
    'eqnarray',
    'math',
    'displaymath',
  ].flatMap((n) => [n, `${n}*`]),
)

/** Commands whose `{argument}` is text even inside math. */
const TEXT_IN_MATH = new Set(['text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'mbox', 'intertext'])

/** Definitions whose argument groups are not checked for math-only use. */
const DEFINITIONS: Readonly<Record<string, number>> = {
  newcommand: 2,
  renewcommand: 2,
  providecommand: 2,
  DeclareRobustCommand: 2,
  DeclareMathOperator: 2,
  newenvironment: 3,
  renewenvironment: 3,
  def: 1,
  gdef: 1,
  edef: 1,
  xdef: 1,
}

const GREEK =
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'
const MATH_ONLY = new Set(
  (
    `${GREEK} frac dfrac tfrac sqrt sum prod coprod int iint oint lim limsup liminf infty partial nabla ` +
    'le leq ge geq neq ne approx equiv sim simeq cong propto times cdot cdots vdots ddots pm mp div ' +
    'to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow mapsto implies iff ' +
    'in notin ni subset subseteq supset supseteq cup cap bigcup bigcap setminus forall exists emptyset ' +
    'mathbb mathcal mathbf mathrm mathit mathsf mathfrak mathscr boldsymbol operatorname ' +
    'left right bigl bigr Bigl Bigr biggl biggr hat widehat tilde widetilde vec bar overline ' +
    'overbrace underbrace binom log ln exp sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh ' +
    'min max sup inf arg det gcd lvert rvert lVert rVert langle rangle lfloor rfloor lceil rceil ' +
    'circ prime ell hbar wedge vee oplus otimes perp parallel mid'
  ).split(/\s+/),
)

type MathCloser = '$' | '$$' | '\\)' | '\\]'

interface ModeFrame {
  mode: 'math' | 'text'
  opener: MathCloser | 'env' | 'group'
  from: number
  to: number
  env?: string
  /** For brace-scoped frames: brace depth that closes this frame. */
  braceDepth?: number
  lefts: number[]
}

interface EnvFrame {
  name: string
  from: number
  to: number
}

const UNCLOSED: Readonly<Record<string, string>> = {
  $: 'Unclosed $ (inline math).',
  $$: 'Unclosed $$ (display math).',
  '\\)': 'Unclosed \\( (inline math).',
  '\\]': 'Unclosed \\[ (display math).',
}

class Scanner {
  readonly issues: LintIssue[] = []
  private readonly envs: EnvFrame[] = []
  private readonly braces: number[] = []
  private readonly modes: ModeFrame[] = []
  private pendingDefinition: { depth: number; groups: number } | null = null
  private readonly bodyStart: number

  constructor(private readonly src: string) {
    const docStart = src.indexOf('\\begin{document}')
    this.bodyStart = docStart === -1 ? 0 : docStart
  }

  private report(from: number, to: number, message: string, severity: LintIssue['severity'] = 'error'): void {
    this.issues.push({ from, to, message, severity })
  }

  private get inMath(): boolean {
    return this.modes.at(-1)?.mode === 'math'
  }

  private closeMath(frame: ModeFrame): void {
    for (const left of frame.lefts) this.report(left, left + 5, '\\left has no matching \\right.')
  }

  run(): LintIssue[] {
    const src = this.src
    let i = 0
    while (i < src.length) {
      const ch = src[i]!
      if (ch === '%') i = this.skipLine(i)
      else if (ch === '\\') i = this.command(i)
      else if (ch === '{') i = this.openBrace(i)
      else if (ch === '}') i = this.closeBrace(i)
      else if (ch === '$') i = this.dollar(i)
      else if (ch === '\n') i = this.newline(i)
      else i++
    }
    this.finish()
    return this.issues.sort((a, b) => a.from - b.from)
  }

  private skipLine(i: number): number {
    const nl = this.src.indexOf('\n', i)
    return nl === -1 ? this.src.length : nl
  }

  private newline(i: number): number {
    // A blank line ends a paragraph, and inline math cannot span it.
    const rest = /^\n[ \t]*\n/.exec(this.src.slice(i, i + 200))
    const top = this.modes.at(-1)
    if (rest && top && (top.opener === '$' || top.opener === '\\)')) {
      this.modes.pop()
      this.report(top.from, top.to, UNCLOSED[top.opener]!)
      this.closeMath(top)
    }
    return i + 1
  }

  private openBrace(i: number): number {
    this.braces.push(i)
    return i + 1
  }

  private closeBrace(i: number): number {
    if (this.braces.length === 0) {
      this.report(i, i + 1, 'Unexpected }.')
      return i + 1
    }
    const depth = this.braces.length
    this.braces.pop()
    const top = this.modes.at(-1)
    if (top?.braceDepth === depth) {
      this.modes.pop()
      if (top.mode === 'math') this.closeMath(top)
    }
    const def = this.pendingDefinition
    if (def && depth === def.depth + 1) {
      const groups = def.groups - 1
      this.pendingDefinition = groups > 0 ? { ...def, groups } : null
    }
    return i + 1
  }

  private dollar(i: number): number {
    const display = this.src[i + 1] === '$'
    const token: MathCloser = display ? '$$' : '$'
    const top = this.modes.at(-1)
    if (top && top.opener === token) {
      this.modes.pop()
      this.closeMath(top)
    } else {
      this.modes.push({ mode: 'math', opener: token, from: i, to: i + token.length, lefts: [] })
    }
    return i + token.length
  }

  private command(i: number): number {
    const src = this.src
    const next = src[i + 1]
    if (next === undefined) return i + 1
    if (!/[A-Za-z@]/.test(next)) return this.controlSymbol(i, next)
    let j = i + 1
    while (j < src.length && /[A-Za-z@]/.test(src[j]!)) j++
    const name = src.slice(i + 1, j)
    if (name === 'begin' || name === 'end') return this.environment(i, j, name)
    if (name === 'verb') return this.verb(j)
    if (name in DEFINITIONS) {
      const braced = /^\s*\{/.test(src.slice(j, j + 50))
      const groups = DEFINITIONS[name]! - (braced || name.endsWith('def') ? 0 : 1)
      if (!this.pendingDefinition) this.pendingDefinition = { depth: this.braces.length, groups }
      return j
    }
    if (name === 'left' || name === 'right') this.leftRight(i, name)
    if (this.inMath && TEXT_IN_MATH.has(name)) this.pushGroupMode(j, 'text')
    else if (name === 'ensuremath') this.pushGroupMode(j, 'math')
    else if (MATH_ONLY.has(name) && !this.inMath && i >= this.bodyStart && !this.pendingDefinition) {
      this.report(i, j, `\\${name} is only allowed in math mode (outside math here).`, 'warning')
    }
    return j
  }

  private controlSymbol(i: number, symbol: string): number {
    if (symbol === '(' || symbol === '[') {
      const closer: MathCloser = symbol === '(' ? '\\)' : '\\]'
      this.modes.push({ mode: 'math', opener: closer, from: i, to: i + 2, lefts: [] })
    } else if (symbol === ')' || symbol === ']') {
      const top = this.modes.at(-1)
      if (top?.opener === `\\${symbol}`) {
        this.modes.pop()
        this.closeMath(top)
      } else {
        this.report(i, i + 2, `\\${symbol} has no matching \\${symbol === ')' ? '(' : '['}.`)
      }
    }
    return i + 2
  }

  /** `\text{`, `\ensuremath{`: the next brace group switches mode. */
  private pushGroupMode(j: number, mode: 'math' | 'text'): void {
    const m = /^\s*\{/.exec(this.src.slice(j, j + 50))
    if (!m) return
    const open = j + m[0].length - 1
    this.modes.push({
      mode,
      opener: 'group',
      from: open,
      to: open + 1,
      braceDepth: this.braces.length + 1,
      lefts: [],
    })
  }

  private leftRight(i: number, name: 'left' | 'right'): void {
    const frame = [...this.modes].reverse().find((f) => f.mode === 'math')
    if (!frame) return // outside math: reported as a math-only command
    if (name === 'left') frame.lefts.push(i)
    else if (frame.lefts.length === 0) this.report(i, i + 6, '\\right has no matching \\left.')
    else frame.lefts.pop()
  }

  private verb(j: number): number {
    const src = this.src
    let k = src[j] === '*' ? j + 1 : j
    const delim = src[k]
    if (!delim || /\s/.test(delim)) return k
    const end = src.indexOf(delim, k + 1)
    k = end === -1 ? this.skipLine(k) : end + 1
    return k
  }

  private environment(i: number, j: number, kind: 'begin' | 'end'): number {
    const m = /^\s*\{([^{}]*)\}/.exec(this.src.slice(j, j + 200))
    if (!m) return j
    const name = m[1]!.trim()
    const to = j + m[0].length
    if (kind === 'begin') return this.beginEnv(i, to, name)
    this.endEnv(i, to, name)
    return to
  }

  private beginEnv(from: number, to: number, name: string): number {
    if (VERBATIM_ENVS.has(name)) {
      const endTag = `\\end{${name}}`
      const end = this.src.indexOf(endTag, to)
      if (end === -1) {
        this.report(from, to, `\\begin{${name}} is never closed.`)
        return this.src.length
      }
      return end + endTag.length
    }
    this.envs.push({ name, from, to })
    if (MATH_ENVS.has(name)) this.modes.push({ mode: 'math', opener: 'env', env: name, from, to, lefts: [] })
    return to
  }

  private endEnv(from: number, to: number, name: string): void {
    const top = this.envs.at(-1)
    const depth = this.envs.map((e) => e.name).lastIndexOf(name)
    if (top && top.name === name) {
      this.envs.pop()
    } else if (depth !== -1 && (top?.name === 'document' || depth === this.envs.length - 1 || name === 'document')) {
      for (const open of this.envs.splice(depth + 1)) {
        this.report(open.from, open.to, `\\begin{${open.name}} is never closed.`)
      }
      this.envs.pop()
    } else if (top && top.name !== 'document') {
      this.report(from, to, `\\end{${name}} does not match \\begin{${top.name}}.`)
      return
    } else {
      this.report(from, to, `\\end{${name}} has no matching \\begin.`)
      return
    }
    this.closeEnvMath(name)
  }

  private closeEnvMath(name: string): void {
    const index = this.modes.findLastIndex((f) => f.opener === 'env' && f.env === name)
    if (index === -1) return
    for (const frame of this.modes.splice(index)) {
      if (frame.opener !== 'env' && frame.opener !== 'group') {
        this.report(frame.from, frame.to, UNCLOSED[frame.opener]!)
      }
      if (frame.mode === 'math') this.closeMath(frame)
    }
  }

  private finish(): void {
    for (const frame of this.modes) {
      if (frame.opener !== 'env' && frame.opener !== 'group') {
        this.report(frame.from, frame.to, UNCLOSED[frame.opener]!)
      }
      if (frame.mode === 'math') this.closeMath(frame)
    }
    for (const open of this.envs) this.report(open.from, open.to, `\\begin{${open.name}} is never closed.`)
    for (const b of this.braces) this.report(b, b + 1, 'Unclosed {.')
  }
}

/** Lint a LaTeX source; issues are sorted by position. */
export function lintLatex(source: string): LintIssue[] {
  if (!source) return []
  return new Scanner(source).run()
}
