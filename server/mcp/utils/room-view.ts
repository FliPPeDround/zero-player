import type { GomokuState } from '#shared/gomoku'
import type { Room } from '#shared/rooms'
import { gomokuMoveLabel, renderGomokuBoard } from '#shared/gomoku'

export interface McpGameResult {
  roomId: string
  game: string
  status: Room['status']
  yourSide: string | null
  currentPlayer: 'you' | 'opponent' | null
  /** Number of the move being played; 1 before the game starts. Omitted when terminal. */
  moveNumber?: number
  /** Latest move in human game notation, e.g. H8. */
  lastMove?: string
  board?: string
  winner?: 'you' | 'opponent' | 'draw'
  reason?: string
}

/**
 * MCP-facing presentation of a room. At this boundary:
 *
 * - The board is always the ASCII diagram in the `board` field; the raw
 *   coordinate-encoded board inside `game.state` is not exposed.
 * - Per-move explanations (`reason`) are spectator-only content from the
 *   battle log, so players never receive the opponent's reason through MCP.
 *
 * The returned object is a deep copy; REST and the web UI keep the full room.
 */
export function toMcpRoomView(room: Room): Room {
  const view = structuredClone(room)

  if (view.game) {
    const state = view.game.state as { board?: unknown } | undefined
    if (state && typeof state === 'object' && 'board' in state)
      delete state.board

    for (const played of view.game.history) {
      const action = played.action as { reason?: unknown } | undefined
      if (action && typeof action === 'object' && 'reason' in action)
        delete action.reason
    }
  }

  for (const event of view.events) {
    if (event.type === 'move' && event.payload && 'reason' in event.payload)
      delete event.payload.reason
  }

  return view
}

/** ASCII board diagram for games that support one, e.g. Gomoku. */
export function renderRoomBoard(room: Room): string | undefined {
  return room.gameId === 'gomoku' && room.game
    ? renderGomokuBoard(room.game.state as GomokuState)
    : undefined
}

/** Room plus ASCII board, the shape every MCP tool returns to callers. */
export function toMcpRoomResult(room: Room): { room: Room, board?: string } {
  const board = renderRoomBoard(room)
  return {
    room: toMcpRoomView(room),
    ...(board ? { board } : {}),
  }
}

/**
 * Minimal MCP-facing game state for move tools. The caller already knows the
 * room through the MCP session resolver, so only a room handle plus the
 * current board and turn are returned. Raw coordinates stay internal; human
 * notation such as H8 is used at this boundary.
 */
export function toMcpGameResult(room: Room, userId: string): McpGameResult {
  const player = room.players.find(p => p.sessionId === userId)
  const symbol = player?.slot === 'black' ? 'X' : player?.slot === 'white' ? 'O' : null
  const result: McpGameResult = {
    roomId: room.id,
    game: room.gameId,
    status: room.status,
    yourSide: player?.slot ? (symbol ? `${player.slot} (${symbol})` : player.slot) : null,
    currentPlayer: room.status === 'playing' && room.game?.currentPlayerId
      ? room.game.currentPlayerId === userId ? 'you' : 'opponent'
      : null,
  }

  if (room.status === 'waiting' || room.status === 'playing')
    result.moveNumber = (room.game?.moveCount ?? 0) + 1

  if (room.gameId === 'gomoku' && room.game) {
    const state = room.game.state as GomokuState
    if (state.lastMove)
      result.lastMove = gomokuMoveLabel(state.lastMove)
  }

  const board = renderRoomBoard(room)
  if (board)
    result.board = board

  if (room.status === 'finished') {
    result.winner = room.game?.winner === userId ? 'you' : room.game?.winner ? 'opponent' : 'draw'
  }
  if (room.game?.finishReason)
    result.reason = room.game.finishReason

  return result
}
