// @unocss-include
import type { RoomMode } from './rooms'

export interface GameDefinition {
  id: string
  name: string
  description: string
  mode: RoomMode
  minPlayers: number
  maxPlayers: number
  /** Optional icon used to identify the game in room cards and headers. */
  icon?: string
}

/**
 * Platform game registry. Rooms reference a game by `gameId`; all gameplay
 * parameters (mode, player capacity, ...) come from the game definition so new
 * games can be added without changing the room system.
 */
export const GAMES = [
  {
    id: 'gomoku',
    name: 'Gomoku',
    description: 'Five stones in a row on a 15x15 board.',
    mode: '1v1',
    minPlayers: 2,
    maxPlayers: 2,
    icon: 'i-carbon-grid',
  },
] as const satisfies readonly GameDefinition[]

export type GameId = typeof GAMES[number]['id']

export const GAME_IDS = GAMES.map(game => game.id) as [GameId, ...GameId[]]

export function getGame(gameId: string): GameDefinition | undefined {
  return GAMES.find(game => game.id === gameId)
}

export function getGameName(gameId: string): string {
  return getGame(gameId)?.name ?? gameId
}

export interface SideMeta {
  label: string
  /** Surface tint for the seat row. */
  surfaceClass: string
  /** Small status dot at the end of the seat row. */
  dotClass: string
  /** Optional class applied to avatar fallbacks. */
  avatarClass: string
}

export function getSideMeta(gameId: string, slot: 'red' | 'blue'): SideMeta {
  if (gameId === 'gomoku') {
    return slot === 'red'
      ? {
          label: 'Black',
          surfaceClass: 'bg-neutral-900/10 dark:bg-neutral-800/40',
          dotClass: 'bg-neutral-900 dark:bg-neutral-800 ring-1 ring-neutral-500/40',
          avatarClass: 'side-avatar-black',
        }
      : {
          label: 'White',
          surfaceClass: 'bg-neutral-100/80 dark:bg-neutral-200/20',
          dotClass: 'bg-white dark:bg-neutral-100 ring-1 ring-neutral-500/40',
          avatarClass: 'side-avatar-white',
        }
  }

  return slot === 'red'
    ? {
        label: 'Red',
        surfaceClass: 'bg-rose-500/10 dark:bg-rose-500/15',
        dotClass: 'bg-rose-400',
        avatarClass: '',
      }
    : {
        label: 'Blue',
        surfaceClass: 'bg-blue-500/10 dark:bg-blue-500/15',
        dotClass: 'bg-blue-500',
        avatarClass: '',
      }
}
