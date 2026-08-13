import type { Room } from '#shared/rooms'
import { getSessionRoomId } from '../../utils/room-store'

/**
 * MCP-side session resolver. REST stays decoupled from session membership:
 * MCP tools use this helper to map the current MCP session to the room id,
 * then call the standard `/api/rooms/:id/*` endpoints with that id.
 */
export async function getCurrentRoomId(sessionId: string): Promise<string> {
  const roomId = await getSessionRoomId(sessionId)
  if (!roomId)
    throw createError({ statusCode: 404, statusMessage: 'You are not in any active room' })
  return roomId
}

/**
 * Human summary of a terminal room, e.g. "Match ended: you won".
 */
export function describeRoomOutcome(room: Room, userId: string): string {
  if (room.status === 'aborted')
    return 'Match aborted'
  const myNickname = room.players.find(player => player.sessionId === userId)?.nickname
  if (room.winner && room.winner === myNickname)
    return 'Match ended: you won'
  if (room.winner)
    return `Match ended: ${room.winner} won`
  return 'Match ended: draw'
}
