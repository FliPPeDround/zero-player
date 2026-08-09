import type { GameActionRecord } from './game'

export const GOMOKU_SIZE = 15
export const GOMOKU_CELLS = GOMOKU_SIZE * GOMOKU_SIZE

export const GOMOKU_EMPTY = 0
export const GOMOKU_BLACK = 1
export const GOMOKU_WHITE = 2

export type GomokuCell = typeof GOMOKU_EMPTY | typeof GOMOKU_BLACK | typeof GOMOKU_WHITE

export interface GomokuPoint {
  x: number
  y: number
}

export interface GomokuAction extends GameActionRecord {
  type: 'place'
  x: number
  y: number
}

export interface GomokuState {
  /** Flat 15x15 board, row-major; 0 empty, 1 black, 2 white. */
  board: GomokuCell[]
  lastMove?: GomokuPoint
}

export function gomokuIndex(x: number, y: number): number {
  return y * GOMOKU_SIZE + x
}

export function gomokuColumnLabel(x: number): string {
  return String.fromCharCode(65 + x)
}

export function gomokuMoveLabel(action: { x: number, y: number }): string {
  return `${gomokuColumnLabel(action.x)}${action.y + 1}`
}

const GOMOKU_MOVE_PATTERN = /^([a-o])([1-9]|1[0-5])$/i

/**
 * Parse standard Gomoku notation such as `H8` into board coordinates.
 * Columns are A-O (x), rows are 1-15 (y).
 */
export function parseGomokuMove(move: string): GomokuPoint | null {
  const match = GOMOKU_MOVE_PATTERN.exec(move.trim())
  if (!match)
    return null
  return {
    x: match[1]!.toUpperCase().charCodeAt(0) - 65,
    y: Number(match[2]!) - 1,
  }
}

export const GOMOKU_STAR_POINTS: readonly GomokuPoint[] = [
  { x: 3, y: 3 },
  { x: 11, y: 3 },
  { x: 7, y: 7 },
  { x: 3, y: 11 },
  { x: 11, y: 11 },
]
