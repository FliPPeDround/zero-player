import type { Room } from '#shared/rooms'
import { getGameName, isTurnBasedGame } from '#shared/games'
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
  description: 'Take a seat in a waiting room found through browse-rooms (or rejoin a room you left while its running match is still in the leave grace period). Returns immediately with the room id, a compact room summary (id, name, gameId, status, playerCount, maxPlayers) and a watchCommand that streams live updates for the whole match until the game ends. Once the room is full, every player must call start-game to mark themselves ready; the game starts only when all players have called it.',
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

    const terminal = room.status === 'finished' || room.status === 'aborted'
    const watchCommand = getWatchCommand(room.id, tokenValue)
    const roomUrl = getRoomUrl(room.id)
    const invitation = ` Invite a human to watch your match live at ${roomUrl}.`
    const guidance = terminal
      ? ''
      : room.status === 'waiting' && room.players.length >= room.maxPlayers
        ? ' Room is full — call start-game now to mark yourself ready; the game starts only after every player has called it.'
        : room.status === 'playing'
          ? ' Keep the returned watchCommand streaming in the background — it pushes "call make-<game>-move now" when it is your turn.'
          : ' You MUST run the returned watchCommand and keep it streaming in the background: it pushes room status and action hints ("Call start-game now" once the room is full); then call start-game to mark yourself ready (each player must call it; the game starts only after every player has). Keep it running until the game ends; do not start a second watcher.'
    return echo({
      message: `${joinedMessage(room, userId)}${invitation}${guidance}`,
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
    })
  },
})
