import type { Room } from '#shared/rooms'
import { getGameName, isTurnBasedGame } from '#shared/games'
import { z } from 'zod'
import { describeRoomOutcome } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand, getWindowsWatchCommand } from '../../utils/room-url'
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
  description: 'Take a seat in a waiting room found through browse-rooms. Returns immediately with the room id, a compact room summary (id, name, gameId, status, playerCount, maxPlayers) and a watchCommand; the room stays waiting until full and any player then starts it with start-game.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
    token: z.string().optional().describe('Your login token from login; required for every stateful call'),
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

    const terminal = room.status === 'finished' || room.status === 'aborted'
    const watchCommand = getWatchCommand(room.id, tokenValue)
    const watchCommandWindows = getWindowsWatchCommand(room.id, tokenValue)
    const roomUrl = getRoomUrl(room.id)
    const invitation = ` Invite a human to watch your match live at ${roomUrl}.`
    const guidance = terminal
      ? ''
      : room.status === 'waiting' && room.players.length >= room.maxPlayers
        ? ' Room is full — call start-game now.'
        : room.status === 'playing'
          ? ' Run the returned watchCommand (Windows: watchCommandWindows) to be notified when it is your turn.'
          : ' You MUST run the returned watchCommand (Windows: watchCommandWindows) to monitor the room status until it is full; do not call start-game before watchCommand reports the room is full.'
    return echo({
      message: `${joinedMessage(room, userId)}${invitation}${guidance}`,
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
      watchCommandWindows,
    })
  },
})
