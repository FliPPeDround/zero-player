// @unocss-include

import type { GameActionRecord } from './game'
import type { GameDefinition } from './games'

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
  /** Optional agent-provided explanation shown to spectators in the battle log. */
  reason?: string
  /**
   * Optional short message sent to the opponent and shown to spectators:
   * banter, taunts or bluffs that make the match entertaining. Unlike
   * `reason`, this is public — the opponent's AI reads it through the watch
   * stream and can reply in character.
   */
  message?: string
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

const GOMOKU_MOVE_PATTERN = /^([A-O])([1-9]|1[0-5])$/

/**
 * Parse standard Gomoku notation such as `H8` into board coordinates.
 * Columns are uppercase A-O (x), rows are 1-15 (y); lowercase letters are
 * rejected.
 */
export function parseGomokuMove(move: string): GomokuPoint | null {
  const match = GOMOKU_MOVE_PATTERN.exec(move.trim())
  if (!match)
    return null
  return {
    x: match[1]!.charCodeAt(0) - 65,
    y: Number(match[2]!) - 1,
  }
}

/**
 * Render the board as plain ASCII art for text-only clients: black `X`,
 * white `O`, empty `.`. Rows run 15-1 from top to bottom (so 1 is at the
 * bottom), and columns A-O are printed on the bottom row from left to right,
 * matching the standard board layout and the notation used by
 * `make-gomoku-move` (e.g. H8).
 */
export function renderGomokuBoard(state: GomokuState): string {
  const letterRow = `   ${Array.from({ length: GOMOKU_SIZE }, (_, x) => gomokuColumnLabel(x)).join(' ')}`
  const lines: string[] = []
  for (let y = GOMOKU_SIZE - 1; y >= 0; y--) {
    const cells = Array.from({ length: GOMOKU_SIZE }, (_, x) => {
      const cell = state.board[gomokuIndex(x, y)] ?? GOMOKU_EMPTY
      return cell === GOMOKU_BLACK ? 'X' : cell === GOMOKU_WHITE ? 'O' : '.'
    })
    lines.push(`${String(y + 1).padStart(2)} ${cells.join(' ')}`)
  }
  lines.push(letterRow)
  return lines.join('\n')
}

export const GOMOKU_STAR_POINTS: readonly GomokuPoint[] = [
  { x: 3, y: 3 },
  { x: 11, y: 3 },
  { x: 7, y: 7 },
  { x: 3, y: 11 },
  { x: 11, y: 11 },
]

/**
 * Gomoku platform definition. This is the single source of truth for the
 * game's metadata: the engine class (`server/games/GomokuGame.ts`) exposes it
 * through `BaseGame.definition`, and the shared registry (`shared/games.ts`)
 * only aggregates it.
 */
export const gomokuDefinition = {
  id: 'gomoku',
  name: 'Gomoku',
  description: 'Five stones in a row on a 15x15 board.',
  sides: [
    {
      key: 'black',
      label: 'Black',
      color: false,
      surfaceClass: 'bg-neutral-900/10 dark:bg-neutral-800/40',
      dotClass: 'bg-neutral-900 dark:bg-neutral-800 ring-1 ring-neutral-500/40',
      avatarClass: 'side-avatar-black',
    },
    {
      key: 'white',
      label: 'White',
      color: false,
      surfaceClass: 'bg-neutral-100/80 dark:bg-neutral-200/20',
      dotClass: 'bg-white dark:bg-neutral-100 ring-1 ring-neutral-500/40',
      avatarClass: 'side-avatar-white',
    },
  ],
  minPlayers: 2,
  maxPlayers: 2,
  turnBased: true,
  icon: 'i-carbon-grid',
} as const satisfies GameDefinition
