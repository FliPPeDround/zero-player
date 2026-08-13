import type { TwentyFourAction, TwentyFourState } from '#shared/24-point'
import type { GamePlayer, GameResult, PlayedAction } from '#shared/game'
import type { GameMcpMoveDefinition } from './BaseGame'
import {
  TWENTY_FOUR_QUESTIONS,
  TWENTY_FOUR_TARGET,
  twentyFourPointDefinition,
} from '#shared/24-point'
import { z } from 'zod'
import { BaseGame } from './BaseGame'

const NUMBER_MIN = 1
const NUMBER_MAX = 9
const EPSILON = 1e-9
const WHITESPACE = /\s/
const DIGIT = /\d/

type Token
  = { kind: 'number', value: number }
    | { kind: 'op', value: '+' | '-' | '*' | '/' }
    | { kind: 'lparen' }
    | { kind: 'rparen' }

type Operator = '+' | '-' | '*' | '/'

interface ExpressionCheck {
  correct: boolean
  feedback: string
}

const OPERATOR_MAP: Record<string, Operator> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  '/': '/',
  '÷': '/',
}

/**
 * 24 Point race game. Both players work through the same three puzzles
 * independently; the first player to submit three correct expressions wins.
 * Wrong or malformed answers are accepted as attempts and only produce
 * feedback, so there is no penalty and no turn-based blocking.
 */
export class TwentyFourGame extends BaseGame<TwentyFourAction, TwentyFourState> {
  readonly gameId = twentyFourPointDefinition.id

  readonly definition = twentyFourPointDefinition

  override readonly turnBased = false

  /**
   * Puzzles generated once per instance. `createInitialState` runs both in the
   * constructor and in `start()`, so without memoization the same room would
   * roll two independent puzzle sets and the first one would be thrown away.
   */
  private puzzles?: number[][]

  static readonly mcpMoveDefinition: GameMcpMoveDefinition = {
    gameId: twentyFourPointDefinition.id,
    toolName: 'make-24-point-move',
    title: 'Make 24 Point answer',
    description: 'Submit an arithmetic expression that uses all four displayed numbers exactly once with + - * / and parentheses to equal 24, e.g. "8/(3-8/3)". Always explain your approach with the reason argument; it is shown to spectators in the battle log. Wrong answers are accepted and returned as incorrect feedback with no penalty, and the tool returns immediately instead of waiting for the opponent.',
    turnBased: false,
    inputSchema: {
      expression: z.string()
        .trim()
        .min(1, 'Enter an expression such as 8/(3-8/3)')
        .max(200, 'Keep the expression under 200 characters')
        .describe('Arithmetic expression using each of the four numbers exactly once, e.g. "8/(3-8/3)". Use * and / (or × and ÷) and parentheses; no exponents.'),
      reason: z.string()
        .trim()
        .min(1, 'Explain your approach')
        .max(500, 'Keep the reason under 500 characters')
        .describe('Why this expression makes 24, in 1-2 short sentences, e.g. "8/3 leaves a fraction, so subtracting it from 3 and dividing 8 by the result gives 24."'),
    },
    inputExamples: [
      { expression: '8/(3-8/3)', reason: 'Dividing 8 by the small fraction left by 8/3 gives 24.' },
      { expression: '6/(1-3/4)', reason: 'The denominator becomes 1/4, so the expression equals 24.' },
    ],
    toAction: ({ expression, reason }) => ({
      type: 'answer',
      expression: String(expression ?? ''),
      ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
    }),
    describeAction: ({ expression }) => `Answered "${String(expression)}"`,
  }

  createInitialState(): TwentyFourState {
    if (!this.puzzles) {
      const puzzles: number[][] = []
      for (let index = 0; index < TWENTY_FOUR_QUESTIONS; index++)
        puzzles.push(generatePuzzle())
      this.puzzles = puzzles
    }
    return {
      puzzles: this.puzzles.map(puzzle => [...puzzle]),
      progress: {},
      attempts: {},
    }
  }

  getCurrentPlayerId(): string | null {
    return null
  }

  validateAction(_playerId: string, action: TwentyFourAction): string | null {
    if (action.type !== 'answer')
      return `Unknown action: ${action.type}`
    if (typeof action.expression !== 'string' || !action.expression.trim())
      return 'Expression is required'
    return null
  }

  applyAction(state: TwentyFourState, action: TwentyFourAction, playerId: string): TwentyFourState {
    const current = state.progress[playerId] ?? 0
    const puzzle = state.puzzles[current] ?? []
    const check = checkExpression(action.expression, puzzle)
    const nextProgress = check.correct ? Math.min(current + 1, state.puzzles.length) : current

    return {
      ...state,
      progress: {
        ...state.progress,
        [playerId]: nextProgress,
      },
      attempts: {
        ...state.attempts,
        [playerId]: (state.attempts[playerId] ?? 0) + 1,
      },
      lastResult: {
        playerId,
        question: Math.min(current + 1, state.puzzles.length),
        correct: check.correct,
        expression: action.expression.trim(),
        feedback: check.feedback,
      },
    }
  }

  getResult(
    state: TwentyFourState,
    _history: PlayedAction<TwentyFourAction>[],
    players: GamePlayer[],
  ): GameResult | null {
    const winner = players.find(player => (state.progress[player.sessionId] ?? 0) >= state.puzzles.length)
    if (!winner)
      return null
    return {
      winner: winner.sessionId,
      reason: 'all-questions-solved',
      details: { puzzles: state.puzzles },
    }
  }

  getLegalActions(_playerId: string): TwentyFourAction[] {
    // Expressions are an unbounded space; the engine validates them directly.
    return []
  }

  protected override getMoveMetadata(playerId: string, _action: TwentyFourAction): Record<string, unknown> | undefined {
    const last = this.state.lastResult
    if (!last || last.playerId !== playerId)
      return undefined
    return {
      question: last.question,
      correct: last.correct,
      feedback: last.feedback,
    }
  }

  protected override recomputeState(): void {
    const puzzles = this.state.puzzles.map(puzzle => [...puzzle])
    this.state = { puzzles, progress: {}, attempts: {} }
    for (const { action, playerId } of this.history)
      this.state = this.applyAction(this.state, action, playerId)
  }
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]!
    if (WHITESPACE.test(char)) {
      index += 1
      continue
    }
    if (DIGIT.test(char)) {
      let digits = ''
      while (index < input.length && DIGIT.test(input[index]!)) {
        digits += input[index]
        index += 1
      }
      tokens.push({ kind: 'number', value: Number(digits) })
      continue
    }
    const operator = OPERATOR_MAP[char]
    if (operator) {
      tokens.push({ kind: 'op', value: operator })
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' })
      index += 1
      continue
    }
    return null
  }

  return tokens
}

class ExpressionParser {
  private position = 0
  readonly numbers: number[] = []

  constructor(private readonly tokens: Token[]) {}

  parse(): number | null {
    const value = this.parseExpression()
    if (value === null || this.position !== this.tokens.length)
      return null
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }

  private consume(): Token | undefined {
    const token = this.tokens[this.position]
    this.position += 1
    return token
  }

  private parseExpression(): number | null {
    let value = this.parseTerm()
    if (value === null)
      return null

    while (true) {
      const token = this.peek()
      if (token?.kind !== 'op' || (token.value !== '+' && token.value !== '-'))
        break
      this.consume()
      const rhs = this.parseTerm()
      if (rhs === null)
        return null
      value = token.value === '+' ? value + rhs : value - rhs
    }
    return value
  }

  private parseTerm(): number | null {
    let value = this.parseFactor()
    if (value === null)
      return null

    while (true) {
      const token = this.peek()
      if (token?.kind !== 'op' || (token.value !== '*' && token.value !== '/'))
        break
      this.consume()
      const rhs = this.parseFactor()
      if (rhs === null)
        return null
      if (token.value === '/' && rhs === 0)
        return null
      value = token.value === '*' ? value * rhs : value / rhs
    }
    return value
  }

  private parseFactor(): number | null {
    const token = this.peek()
    if (!token)
      return null

    if (token.kind === 'number') {
      this.consume()
      this.numbers.push(token.value)
      return token.value
    }

    if (token.kind === 'lparen') {
      this.consume()
      const value = this.parseExpression()
      if (value === null)
        return null
      if (this.peek()?.kind !== 'rparen')
        return null
      this.consume()
      return value
    }

    return null
  }
}

function checkExpression(raw: string, puzzle: number[]): ExpressionCheck {
  const expression = raw.trim()
  const tokens = tokenize(expression)
  if (!tokens)
    return { correct: false, feedback: 'The expression contains unsupported characters.' }

  const parser = new ExpressionParser(tokens)
  const value = parser.parse()
  if (value === null)
    return { correct: false, feedback: 'The expression is malformed (check operators, parentheses and division by zero).' }

  if (!sameMultiset(parser.numbers, puzzle))
    return { correct: false, feedback: 'Use each of the four displayed numbers exactly once.' }

  if (!Number.isFinite(value) || Math.abs(value - TWENTY_FOUR_TARGET) > EPSILON)
    return { correct: false, feedback: 'The expression does not equal 24.' }

  return { correct: true, feedback: 'Correct!' }
}

function sameMultiset(actual: number[], expected: number[]): boolean {
  if (actual.length !== expected.length)
    return false
  const left = [...actual].sort((a, b) => a - b)
  const right = [...expected].sort((a, b) => a - b)
  return left.every((value, index) => value === right[index])
}

function generatePuzzle(): number[] {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const numbers: number[] = []
    for (let index = 0; index < 4; index++)
      numbers.push(Math.floor(Math.random() * (NUMBER_MAX - NUMBER_MIN + 1)) + NUMBER_MIN)
    if (hasSolution(numbers))
      return numbers
  }
  // Extremely unlikely fallback: a known solvable classic.
  return [3, 3, 8, 8]
}

function hasSolution(numbers: number[]): boolean {
  if (numbers.length === 1)
    return Math.abs((numbers[0] ?? 0) - TWENTY_FOUR_TARGET) < EPSILON

  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      const a = numbers[i]!
      const b = numbers[j]!
      const rest = numbers.filter((_, index) => index !== i && index !== j)
      const candidates = [
        a + b,
        a - b,
        b - a,
        a * b,
        b !== 0 ? a / b : Number.NaN,
        a !== 0 ? b / a : Number.NaN,
      ]
      for (const value of candidates) {
        if (!Number.isFinite(value))
          continue
        if (hasSolution([...rest, value]))
          return true
      }
    }
  }
  return false
}
