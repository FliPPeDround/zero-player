// @unocss-include

import { twentyFourPointDefinition } from './24-point'
import { gomokuDefinition } from './gomoku'

export interface GameSide {
  /** Stable seat id stored on room/game players, e.g. `black`, `white`. */
  key: string
  /** Human label shown in the UI, e.g. `Black`. */
  label: string
  /** Badge/palette color for this side; `false` renders a neutral badge. */
  color?: string | false
  /** Surface tint for the seat row. */
  surfaceClass: string
  /** Small status dot at the end of the seat row. */
  dotClass: string
  /** Optional class applied to avatar fallbacks. */
  avatarClass: string
}

export interface GameDefinition {
  id: string
  name: string
  description: string
  /**
   * Fixed sides of the game, in seat order. Two-sided games (e.g. Gomoku's
   * black/white) render as a versus match; games without fixed sides render
   * generic seats.
   */
  sides: GameSide[]
  minPlayers: number
  maxPlayers: number
  /** Optional icon used to identify the game in room cards and headers. */
  icon?: string
  /**
   * `true` for lockstep turn-based games (e.g. Gomoku), where only the
   * current player may submit actions. `false` for race games (e.g. 24 Point)
   * where every player acts independently and move tools never block.
   */
  turnBased: boolean
}

/**
 * Platform game registry. Rooms reference a game by `gameId`; all gameplay
 * parameters (sides, player capacity, ...) come from the game definition so
 * new games can be added without changing the room system. Each game's
 * definition lives next to its game module (e.g. `gomokuDefinition` in
 * `shared/gomoku.ts`); this module only aggregates them for lookup.
 */
export const GAMES = [
  gomokuDefinition,
  twentyFourPointDefinition,
] as const satisfies readonly GameDefinition[]

export type GameId = typeof GAMES[number]['id']

export const GAME_IDS = GAMES.map(game => game.id) as [GameId, ...GameId[]]

export function getGame(gameId: string): GameDefinition | undefined {
  return GAMES.find(game => game.id === gameId)
}

export function getGameName(gameId: string): string {
  return getGame(gameId)?.name ?? gameId
}

export function isTurnBasedGame(gameId: string): boolean {
  return getGame(gameId)?.turnBased !== false
}
