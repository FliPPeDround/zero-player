import type { GomokuState } from '#shared/gomoku'
import type { Room } from '#shared/rooms'
import { renderGomokuBoard } from '#shared/gomoku'

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
