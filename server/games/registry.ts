import type { GameActionRecord, GamePlayer } from '#shared/game'
import type { Room } from '#shared/rooms'
import type { BaseGame } from './BaseGame'
import { GomokuGame } from './GomokuGame'

type GameConstructor<
  TAction extends GameActionRecord = GameActionRecord,
  TState = unknown,
> = new (roomId: string, players: GamePlayer[]) => BaseGame<TAction, TState>

/**
 * Maps a registered game id to its engine. The room system goes through this
 * registry exclusively, so adding a game is: implement BaseGame, register it,
 * declare it in shared/games.ts.
 */
const GAME_REGISTRY: Record<string, GameConstructor> = {
  gomoku: GomokuGame,
}

export function getGameConstructor(gameId: string): GameConstructor | undefined {
  return GAME_REGISTRY[gameId]
}

/**
 * Hydrate the game attached to a room. Fresh rooms get a new engine instance;
 * rooms that already carry a snapshot restore it, so server restarts and cold
 * starts resume mid-match without losing the board.
 */
export function createGameInstance(room: Room): BaseGame {
  const GameClass = getGameConstructor(room.gameId)
  if (!GameClass)
    throw new Error(`No engine registered for game: ${room.gameId}`)

  const players = room.players.map(({ sessionId, nickname, slot }) => ({
    sessionId,
    nickname,
    slot,
  }))
  const game = new GameClass(room.id, players)

  if (room.game)
    game.restore(room.game)
  else if (room.status === 'playing')
    game.start()

  return game
}
