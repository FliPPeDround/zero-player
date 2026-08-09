/**
 * Game contracts shared between the server engine and the spectator client.
 *
 * A game instance is owned by exactly one room. The room system treats the
 * snapshot as an opaque, serializable document: it creates the game, forwards
 * actions into it, persists the snapshot, and broadcasts it. Every game
 * implements `server/games/BaseGame` and serializes to this shape, so the room
 * layer never needs to know the rules of any specific game.
 */

export type GameStatus = 'waiting' | 'playing' | 'finished' | 'aborted'

export interface GamePlayer {
  sessionId: string
  nickname: string
  slot: string
}

export interface GameActionRecord {
  type: string
  [key: string]: unknown
}

export interface PlayedAction<TAction extends GameActionRecord = GameActionRecord> {
  playerId: string
  action: TAction
}

export interface GameResult {
  /** Session id of the winner. Omit for a draw. */
  winner?: string
  /** Machine-readable finish reason, e.g. `five-in-row`, `board-full`, `resign`. */
  reason?: string
  /** Game-specific details worth replaying in the UI, e.g. a winning line. */
  details?: Record<string, unknown>
}

export interface GameSnapshot {
  /** Bump when the serialized shape changes; engines should migrate on restore. */
  schemaVersion: number
  gameId: string
  status: GameStatus
  players: GamePlayer[]
  currentPlayerId: string | null
  moveCount: number
  history: PlayedAction[]
  winner?: string
  finishReason?: string
  finishDetails?: Record<string, unknown>
  state: unknown
}
