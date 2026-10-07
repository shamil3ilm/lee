import { parse, type Node } from 'acorn'
import { SHORT_NAMES_OK } from './quality'
import type { QualityMetrics } from './quality-types'

/**
 * AST metrics for JavaScript (and TypeScript after type stripping), with
 * acorn (v13 §4.3). Also flags sandbox escapes the runtime guards cannot
 * catch: dynamic `import()` and `importScripts`. Imported only by the JS
 * runner worker and tests, never by a page.
 */

type AnyNode = Node & Record<string, unknown>

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const NESTING = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement',
])
const DECISIONS = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
])

function children(node: AnyNode): AnyNode[] {
  const out: AnyNode[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v === 'object' && typeof (v as AnyNode).type === 'string') out.push(v as AnyNode)
    } else if (value && typeof value === 'object' && typeof (value as AnyNode).type === 'string') {
      out.push(value as AnyNode)
    }
  }
  return out
}

function lineSpan(node: AnyNode): number {
  const loc = node.loc
  return loc ? loc.end.line - loc.start.line + 1 : 0
}

function declaredNames(node: AnyNode): string[] {
  const names: string[] = []
  const pattern = (p: unknown): void => {
    const n = p as AnyNode | null
    if (!n) return
    if (n.type === 'Identifier') names.push(n.name as string)
    else if (n.type === 'AssignmentPattern') pattern(n.left)
    else if (n.type === 'RestElement') pattern(n.argument)
    else if (n.type === 'ArrayPattern') (n.elements as unknown[]).forEach(pattern)
    else if (n.type === 'ObjectPattern') (n.properties as AnyNode[]).forEach((prop) => pattern(prop.type === 'Property' ? prop.value : prop))
  }
  if (node.type === 'VariableDeclarator') pattern(node.id)
  if (FUNCTIONS.has(node.type)) {
    if (node.id) pattern(node.id)
    ;(node.params as unknown[]).forEach(pattern)
  }
  return names
}

export interface JsAnalysis {
  metrics: QualityMetrics
  /** Non-null when the code uses a construct the sandbox forbids. */
  forbidden: string | null
}

export type JsAnalysisResult = { ok: true; analysis: JsAnalysis } | { ok: false; error: string }

export function analyzeJs(source: string): JsAnalysisResult {
  let ast: AnyNode
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }) as unknown as AnyNode
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `SyntaxError: ${err.message}` : String(err) }
  }
  let maxFnLength = 0
  let nesting = 0
  let decisions = 0
  let forbidden: string | null = null
  const shortNames = new Set<string>()

  const visit = (node: AnyNode, depth: number, inFunction: boolean): void => {
    let d = depth
    if (FUNCTIONS.has(node.type)) {
      maxFnLength = Math.max(maxFnLength, lineSpan(node))
      d = 0
      inFunction = true
    } else if (NESTING.has(node.type) && !(node.type === 'IfStatement' && isElseIf(node))) {
      d = depth + 1
      if (inFunction) nesting = Math.max(nesting, d)
    }
    if (DECISIONS.has(node.type)) decisions++
    if (node.type === 'SwitchCase' && node.test) decisions++
    if (node.type === 'LogicalExpression') decisions++
    if (node.type === 'ImportExpression') forbidden = 'Dynamic import() is disabled in the sandbox.'
    if (node.type === 'Identifier' && node.name === 'importScripts') forbidden = 'importScripts is disabled in the sandbox.'
    for (const name of declaredNames(node)) if (name.length === 1 && !SHORT_NAMES_OK.has(name)) shortNames.add(name)
    for (const child of children(node)) visit(child, child === node.alternate && node.type === 'IfStatement' ? depth : d, inFunction)
  }
  const elseIfs = new WeakSet<object>()
  const isElseIf = (n: AnyNode): boolean => elseIfs.has(n)
  const markElseIf = (n: AnyNode): void => {
    if (n.type === 'IfStatement' && n.alternate && (n.alternate as AnyNode).type === 'IfStatement') elseIfs.add(n.alternate as object)
    for (const c of children(n)) markElseIf(c)
  }
  markElseIf(ast)
  visit(ast, 0, false)
  return {
    ok: true,
    analysis: {
      metrics: { maxFnLength, nesting, cyclomatic: decisions + 1, namingIssues: shortNames.size, method: 'ast' },
      forbidden,
    },
  }
}
