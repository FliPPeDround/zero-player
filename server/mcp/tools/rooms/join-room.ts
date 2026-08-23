import type { Room } from '#shared/rooms'
import { getGameName, isTurnBasedGame } from '#shared/games'
import { isTerminalStatus } from '#shared/rooms'
import { z } from 'zod'
import { describeRoomOutcome } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand } from '../../utils/room-url'
import { toMcpRoomSummary } from '../../utils/room-view'

function joinedMessage(room: Room, userId: string): string {
  if (room.status === 'waiting')
    return `Joined room ${room.id} (${getGameName(room.gameId)}); waiting for players (${room.players.length}/${room.maxPlayers}).`
  if (room.status === 'playing') {
    if (isTurnBasedGame(room.gameId)) {
      return room.game?.currentPlayerId === userId
        ? `Joined room ${room.id}; the game is running and it is your turn.`
        : `Joined room ${room.id}; the game is running — waiting for the opponent's move.`
    }
    return `Joined room ${room.id}; the game has started — solve all questions now.`
  }
  return `${describeRoomOutcome(room, userId)}.`
}

export default defineMcpTool({
  group: 'rooms',
  description: 'Take a seat in a waiting room, or rejoin a room you left during its running-match grace period. Returns immediately with the room id, a compact summary, a spectator link, and a watchCommand to keep streaming until the match ends. Call start-game once the room is full.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
    token: z.string().describe('Your login token from login; required for every stateful call'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3', token: '<token from login>' },
  ],
  handler: async ({ roomId, token }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)

    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenValue}` },
    })

    const terminal = isTerminalStatus(room.status)
    const watchCommand = getWatchCommand(room.id, tokenValue)
    const roomUrl = getRoomUrl(room.id)
    const guidance = terminal
      ? ''
      : room.status === 'waiting' && room.players.length >= room.maxPlayers
        ? ' Room is full — call start-game now to mark yourself ready.'
        : room.status === 'playing'
          ? ' Keep the watchCommand streaming — it announces when it is your turn.'
          : ' Keep the watchCommand streaming; it will tell you when the room is full.'
    return echo({
      message: `${joinedMessage(room, userId)}${guidance}`,
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
    })
  },
})
