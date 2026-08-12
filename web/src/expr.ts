import {
  bind,
  bundle,
  permute,
  similarity,
  unbind,
  type PhaseVector,
} from 'hrr-lib'

/** A user-facing problem with an expression: bad syntax, name, or type. */
export class ExprError extends Error {
  override name = 'ExprError'
}

/** The result of evaluating an expression. */
export type Value =
  | { kind: 'vector'; vector: PhaseVector }
  | { kind: 'scalar'; value: number }

/** An input line, split into an optional target name and the expression. */
export interface Statement {
  name: string | null
  expression: string
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Split `name = expression` from a bare expression. Only a leading `=` at the
 * top level counts, so `similarity(a, b)` is never read as an assignment.
 */
export function splitAssignment(input: string): Statement {
  const eq = input.indexOf('=')
  if (eq === -1) return { name: null, expression: input.trim() }

  const name = input.slice(0, eq).trim()
  if (!IDENT.test(name)) {
    throw new ExprError(`"${name}" is not a valid name`)
  }
  return { name, expression: input.slice(eq + 1).trim() }
}

type Token =
  | { type: 'name'; value: string }
  | { type: 'number'; value: number }
  | { type: 'punct'; value: '(' | ')' | ',' }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < source.length) {
    const ch = source[i]!

    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: 'punct', value: ch })
      i++
      continue
    }

    if (/[-0-9.]/.test(ch)) {
      const start = i
      i++
      while (i < source.length && /[0-9.]/.test(source[i]!)) i++
      const text = source.slice(start, i)
      const value = Number(text)
      if (!Number.isFinite(value)) {
        throw new ExprError(`"${text}" is not a number`)
      }
      tokens.push({ type: 'number', value })
      continue
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i++
      tokens.push({ type: 'name', value: source.slice(start, i) })
      continue
    }

    throw new ExprError(`unexpected character "${ch}"`)
  }

  return tokens
}

type Node =
  | { type: 'ref'; name: string }
  | { type: 'number'; value: number }
  | { type: 'call'; fn: string; args: Node[] }

function parse(source: string): Node {
  const tokens = tokenize(source)
  if (tokens.length === 0) throw new ExprError('expression is empty')

  let pos = 0

  const peek = (): Token | undefined => tokens[pos]

  const parseNode = (): Node => {
    const token = tokens[pos]
    if (token === undefined) throw new ExprError('expression ended early')
    pos++

    if (token.type === 'number') return { type: 'number', value: token.value }

    if (token.type === 'name') {
      const next = peek()
      if (next?.type !== 'punct' || next.value !== '(') {
        return { type: 'ref', name: token.value }
      }
      pos++ // consume '('

      const args: Node[] = []
      const closing = peek()
      if (closing?.type === 'punct' && closing.value === ')') {
        pos++
        return { type: 'call', fn: token.value, args }
      }

      for (;;) {
        args.push(parseNode())
        const sep = peek()
        if (sep?.type === 'punct' && sep.value === ',') {
          pos++
          continue
        }
        if (sep?.type === 'punct' && sep.value === ')') {
          pos++
          return { type: 'call', fn: token.value, args }
        }
        throw new ExprError('expected ) or , in the argument list')
      }
    }

    throw new ExprError(`unexpected "${token.value}"`)
  }

  const node = parseNode()
  if (pos !== tokens.length) {
    const extra = tokens[pos]!
    throw new ExprError(`unexpected "${extra.value}" after the expression`)
  }
  return node
}

/** Every name an expression reads, in first-seen order, without duplicates. */
export function identifiers(expression: string): string[] {
  const found: string[] = []

  const walk = (node: Node): void => {
    if (node.type === 'ref') {
      if (!found.includes(node.name)) found.push(node.name)
      return
    }
    if (node.type === 'call') node.args.forEach(walk)
  }

  walk(parse(expression))
  return found
}

const asVector = (value: Value, fn: string, at: number): PhaseVector => {
  if (value.kind !== 'vector') {
    throw new ExprError(`${fn} expects a vector as argument ${at + 1}`)
  }
  return value.vector
}

const asNumber = (value: Value, fn: string, at: number): number => {
  if (value.kind !== 'scalar') {
    throw new ExprError(`${fn} expects a number as argument ${at + 1}`)
  }
  return value.value
}

const expectArity = (fn: string, args: unknown[], n: number): void => {
  if (args.length !== n) {
    throw new ExprError(`${fn} expects ${n} arguments, got ${args.length}`)
  }
}

/**
 * Evaluate an expression against named vectors. Library errors — a dimension
 * mismatch, a bad shift — are re-thrown as ExprError so the UI has one error
 * type to render.
 */
export function evaluate(
  expression: string,
  env: ReadonlyMap<string, PhaseVector>,
): Value {
  const run = (node: Node): Value => {
    if (node.type === 'number') return { kind: 'scalar', value: node.value }

    if (node.type === 'ref') {
      const vector = env.get(node.name)
      if (vector === undefined) {
        throw new ExprError(`unknown name "${node.name}"`)
      }
      return { kind: 'vector', vector }
    }

    const { fn, args } = node
    const values = args.map(run)

    try {
      switch (fn) {
        case 'bind':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: bind(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        case 'unbind':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: unbind(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        case 'bundle': {
          if (values.length < 2) {
            throw new ExprError('bundle expects at least 2 arguments')
          }
          const vectors = values.map((v, i) => asVector(v, fn, i))
          return { kind: 'vector', vector: bundle(...vectors) }
        }
        case 'permute':
          expectArity(fn, values, 2)
          return {
            kind: 'vector',
            vector: permute(
              asVector(values[0]!, fn, 0),
              asNumber(values[1]!, fn, 1),
            ),
          }
        case 'similarity':
          expectArity(fn, values, 2)
          return {
            kind: 'scalar',
            value: similarity(
              asVector(values[0]!, fn, 0),
              asVector(values[1]!, fn, 1),
            ),
          }
        default:
          throw new ExprError(`unknown function "${fn}"`)
      }
    } catch (error) {
      if (error instanceof ExprError) throw error
      throw new ExprError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return run(parse(expression))
}
