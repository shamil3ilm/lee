import type { CodeLanguage, FunctionSpec, Problem, ValueSpec, ValueType } from './schema'

/**
 * Starter code per language, generated from the problem's function
 * signature so every language agrees on names and argument order. Python
 * uses snake_case names; JS, TS and PHP keep camelCase. Pure, client-safe.
 */

export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

/** The function name the harness calls in `language`. */
export function fnNameFor(spec: Pick<FunctionSpec, 'name'>, language: CodeLanguage): string {
  return language === 'python' ? snakeCase(spec.name) : spec.name
}

const TS: Readonly<Record<ValueType, string>> = {
  int: 'number',
  float: 'number',
  bool: 'boolean',
  string: 'string',
  'int[]': 'number[]',
  'float[]': 'number[]',
  'string[]': 'string[]',
  'bool[]': 'boolean[]',
  'int[][]': 'number[][]',
  'string[][]': 'string[][]',
  object: 'Record<string, unknown>',
  'object[]': 'Array<Record<string, unknown>>',
  tree: 'TreeNode | null',
  any: 'unknown',
}

const PY: Readonly<Record<ValueType, string>> = {
  int: 'int',
  float: 'float',
  bool: 'bool',
  string: 'str',
  'int[]': 'list[int]',
  'float[]': 'list[float]',
  'string[]': 'list[str]',
  'bool[]': 'list[bool]',
  'int[][]': 'list[list[int]]',
  'string[][]': 'list[list[str]]',
  object: 'dict',
  'object[]': 'list[dict]',
  tree: 'Optional[dict]',
  any: 'Any',
}

const PHP: Readonly<Record<ValueType, string>> = {
  int: 'int',
  float: 'float',
  bool: 'bool',
  string: 'string',
  'int[]': 'array',
  'float[]': 'array',
  'string[]': 'array',
  'bool[]': 'array',
  'int[][]': 'array',
  'string[][]': 'array',
  object: 'array',
  'object[]': 'array',
  tree: '?array',
  any: 'mixed',
}

const JSDOC: Readonly<Record<ValueType, string>> = {
  ...TS,
  object: 'Object',
  'object[]': 'Object[]',
  tree: '{val: number, left: Object|null, right: Object|null}|null',
  any: '*',
}

function usesTree(spec: FunctionSpec): boolean {
  return [...spec.params, spec.returns].some((v) => v.type === 'tree')
}

function tsType(v: Pick<ValueSpec, 'type' | 'tsType'>): string {
  return v.tsType ?? TS[v.type]
}

function javascript(spec: FunctionSpec): string {
  const docs = spec.params.map((p) => ` * @param {${JSDOC[p.type]}} ${p.name}`)
  return [
    '/**',
    ...docs,
    ` * @return {${JSDOC[spec.returns.type]}}`,
    ' */',
    `function ${spec.name}(${spec.params.map((p) => p.name).join(', ')}) {`,
    '  ',
    '}',
    '',
  ].join('\n')
}

function typescript(spec: FunctionSpec): string {
  const tree = usesTree(spec) ? ['interface TreeNode {', '  val: number', '  left: TreeNode | null', '  right: TreeNode | null', '}', ''] : []
  return [
    ...tree,
    `function ${spec.name}(${spec.params.map((p) => `${p.name}: ${tsType(p)}`).join(', ')}): ${tsType(spec.returns)} {`,
    '  ',
    '}',
    '',
  ].join('\n')
}

function python(spec: FunctionSpec): string {
  const typing = [...spec.params, spec.returns].some((v) => v.type === 'tree' || v.type === 'any')
  return [
    ...(typing ? ['from typing import Any, Optional', '', ''] : []),
    `def ${snakeCase(spec.name)}(${spec.params.map((p) => `${snakeCase(p.name)}: ${PY[p.type]}`).join(', ')}) -> ${PY[spec.returns.type]}:`,
    '    pass',
    '',
  ].join('\n')
}

function php(spec: FunctionSpec): string {
  const ret = spec.returns.type === 'any' ? 'mixed' : PHP[spec.returns.type]
  return [
    '<?php',
    '',
    `function ${spec.name}(${spec.params.map((p) => `${PHP[p.type]} $${p.name}`).join(', ')}): ${ret}`,
    '{',
    '    ',
    '}',
    '',
  ].join('\n')
}

const SQL_STARTER = '-- Write one SELECT statement.\nSELECT 1;\n'

export function starterCode(problem: Problem, language: CodeLanguage): string {
  if (problem.kind === 'sql') return problem.starter ?? SQL_STARTER
  const override = language !== 'sql' ? problem.starter?.[language] : undefined
  if (override) return override.endsWith('\n') ? override : `${override}\n`
  switch (language) {
    case 'javascript':
      return javascript(problem.fn)
    case 'typescript':
      return typescript(problem.fn)
    case 'python':
      return python(problem.fn)
    case 'php':
      return php(problem.fn)
    case 'sql':
      return SQL_STARTER
  }
}
