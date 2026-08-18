import type { GamePlayer, GameResult, PlayedAction } from '#shared/game'
import type { GomokuAction, GomokuCell, GomokuPoint, GomokuState } from '#shared/gomoku'
import type { GameMcpMoveDefinition } from './BaseGame'
import {
  GOMOKU_BLACK,
  GOMOKU_CELLS,
  GOMOKU_EMPTY,
  GOMOKU_SIZE,
  GOMOKU_WHITE,
  gomokuDefinition,
  gomokuIndex,
  parseGomokuMove,
} from '#shared/gomoku'
import { z } from 'zod'
import { BaseGame } from './BaseGame'

const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
] as const

const GOMOKU_POINT_PATTERN = /^[A-O]([1-9]|1[0-5])$/

/**
 * Gomoku on a standard 15x15 board. Black (first seat) starts, players
 * alternate, and the first player to make an unbroken run of five or more
 * stones wins. A full board with no winner is a draw.
 */
export class GomokuGame extends BaseGame<GomokuAction, GomokuState> {
  readonly gameId = gomokuDefinition.id

  readonly definition = gomokuDefinition

  static readonly mcpMoveDefinition: GameMcpMoveDefinition = {
    gameId: gomokuDefinition.id,
    toolName: 'make-gomoku-move',
    title: 'Make Gomoku move',
    description: 'Place your stone on the Gomoku board using standard chess-like notation: column A–O, row 1–15, e.g. H8.',
    inputSchema: {
      move: z.string()
        .regex(GOMOKU_POINT_PATTERN, 'Use uppercase standard notation like H8, e.g. A1, H8 or O15')
        .describe('Uppercase standard Gomoku coordinate, e.g. H8'),
      reason: z.string()
        .trim()
        .min(1, 'Explain why you chose this move')
        .max(500, 'Keep the reason under 500 characters')
        .describe('Why you chose this move, in 1-2 short sentences (shown to spectators), e.g. "Blocks white\'s open three and starts my own four."'),
    },
    inputExamples: [
      { move: 'H8', reason: 'Taking the center gives me the most options in the opening.' },
      { move: 'D7', reason: 'Blocks black\'s open three before it becomes four.' },
    ],
    toAction: ({ move, reason }) => {
      const point = parseGomokuMove(String(move ?? ''))
      if (!point)
        throw createError({ statusCode: 400, statusMessage: `Invalid Gomoku move: ${String(move)}` })
      return {
        type: 'place',
        x: point.x,
        y: point.y,
        ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
      }
    },
    describeAction: ({ move }) => `Placed a stone at ${String(move)}`,
  }

  createInitialState(): GomokuState {
    return { board: Array.from<GomokuCell>({ length: GOMOKU_CELLS }).fill(GOMOKU_EMPTY) }
  }

  getCurrentPlayerId(
    _state: GomokuState,
    history: PlayedAction<GomokuAction>[],
    players: GamePlayer[],
  ): string | null {
    return history.length < GOMOKU_CELLS
      ? players[history.length % players.length]?.sessionId ?? null
      : null
  }

  validateAction(_playerId: string, action: GomokuAction): string | null {
    if (action.type !== 'place')
      return `Unknown action: ${action.type}`
    if (!Number.isInteger(action.x) || !Number.isInteger(action.y))
      return 'Coordinates must be integers'
    if (action.x < 0 || action.x >= GOMOKU_SIZE || action.y < 0 || action.y >= GOMOKU_SIZE)
      return 'Coordinates are outside the board'
    if (this.state.board[gomokuIndex(action.x, action.y)] !== GOMOKU_EMPTY)
      return 'Cell is already occupied'
    return null
  }

  applyAction(state: GomokuState, action: GomokuAction, playerId: string): GomokuState {
    const board = state.board.slice()
    board[gomokuIndex(action.x, action.y)] = this.colorOf(playerId)
    return { board, lastMove: { x: action.x, y: action.y } }
  }

  getResult(
    state: GomokuState,
    history: PlayedAction<GomokuAction>[],
    players: GamePlayer[],
  ): GameResult | null {
    const last = state.lastMove
    if (!last)
      return null

    const color = state.board[gomokuIndex(last.x, last.y)] ?? GOMOKU_EMPTY
    const line = findWinningLine(state.board, last, color)
    if (line) {
      return {
        winner: this.playerIdOf(color, players),
        reason: 'five-in-row',
        details: { winLine: line },
      }
    }

    if (history.length >= GOMOKU_CELLS)
      return { reason: 'board-full' }

    return null
  }

  getLegalActions(_playerId: string): GomokuAction[] {
    const actions: GomokuAction[] = []
    for (let y = 0; y < GOMOKU_SIZE; y++) {
      for (let x = 0; x < GOMOKU_SIZE; x++) {
        if (this.state.board[gomokuIndex(x, y)] === GOMOKU_EMPTY)
          actions.push({ type: 'place', x, y })
      }
    }
    return actions
  }

  private colorOf(playerId: string): GomokuCell {
    const index = this.players.findIndex(player => player.sessionId === playerId)
    if (index === -1)
      throw new Error(`Unknown player: ${playerId}`)
    return index === 0 ? GOMOKU_BLACK : GOMOKU_WHITE
  }

  private playerIdOf(color: number, players: GamePlayer[]): string | undefined {
    return players[color === GOMOKU_BLACK ? 0 : 1]?.sessionId
  }
}

function findWinningLine(
  board: GomokuCell[],
  start: GomokuPoint,
  color: number,
): GomokuPoint[] | null {
  for (const { dx, dy } of DIRECTIONS) {
    const line: GomokuPoint[] = [{ ...start }]

    for (const sign of [1, -1] as const) {
      let x = start.x + dx * sign
      let y = start.y + dy * sign
      while (
        x >= 0
        && x < GOMOKU_SIZE
        && y >= 0
        && y < GOMOKU_SIZE
        && board[gomokuIndex(x, y)] === color
      ) {
        const point = { x, y }
        if (sign === 1)
          line.push(point)
        else
          line.unshift(point)
        x += dx * sign
        y += dy * sign
      }
    }

    if (line.length >= 5)
      return line
  }

  return null
}
