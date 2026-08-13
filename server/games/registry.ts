import type { GameActionRecord, GamePlayer } from '#shared/game'
import type { Room } from '#shared/rooms'
import type { BaseGame, GameMcpMoveDefinition } from './BaseGame'
import { GomokuGame } from './GomokuGame'
import { TwentyFourGame } from './TwentyFourGame'

type GameConstructor<
  TAction extends GameActionRecord = GameActionRecord,
  TState = unknown,
> = (new (roomId: string, players: GamePlayer[]) => BaseGame<TAction, TState>) & {
  /**
   * MCP is the primary way agents play, so every registered game must expose
   * its move tool contract; the one-line file under `server/mcp/tools/games/`
   * registers it.
   */
  readonly mcpMoveDefinition: GameMcpMoveDefinition
}

/**
 * Maps a registered game id to its engine. The room system goes through this
 * registry exclusively, so adding a game is: define it next to its shared
 * module (e.g. `gomokuDefinition` in `shared/gomoku.ts`), implement BaseGame
 * with that definition plus its static `mcpMoveDefinition`, register the
 * class here.
 */
const GAME_REGISTRY: Record<string, GameConstructor> = {
  'gomoku': GomokuGame,
  '24-point': TwentyFourGame,
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
