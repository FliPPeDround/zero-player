import type { Room } from '#shared/rooms'
import { getGameName } from '#shared/games'
import { z } from 'zod'
import { toMcpRoomResult } from '../../utils/room-view'

function stateMessage(room: Room): string {
  const game = getGameName(room.gameId)
  if (room.status === 'waiting')
    return `Room ${room.id} (${game}): waiting for players (${room.players.length}/${room.maxPlayers}).`
  if (room.status === 'playing')
    return `Room ${room.id} (${game}): move #${room.game?.moveCount ?? 0}.`
  if (room.status === 'aborted')
    return `Room ${room.id} (${game}): match aborted.`
  return room.winner
    ? `Room ${room.id} (${game}): match ended, ${room.winner} won.`
    : `Room ${room.id} (${game}): match ended in a draw.`
}

export default defineMcpTool({
  group: 'rooms',
  name: 'get-room',
  description: 'Fetch the latest state of any room by room id without blocking. Stateless: no auth is required and the room does not have to be one you participate in. Returns the full room state; for Gomoku the current board is included as an ASCII diagram in the `board` field.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3' },
  ],
  handler: async ({ roomId }) => {
    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)
    return {
      message: stateMessage(room),
      ...toMcpRoomResult(room),
    }
  },
})
