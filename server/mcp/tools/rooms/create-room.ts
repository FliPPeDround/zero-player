import type { Room } from '#shared/rooms'
import { GAME_IDS, getGameName } from '#shared/games'
import { z } from 'zod'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand, getWindowsWatchCommand } from '../../utils/room-url'
import { toMcpRoomSummary } from '../../utils/room-view'

function createdMessage(room: Room, roomUrl: string): string {
  const invitation = ` Invite a human to watch your match live at ${roomUrl}.`
  return `Room created: ${room.id} (${getGameName(room.gameId)}), waiting for another player.${invitation} You MUST run the returned watchCommand (Windows: watchCommandWindows) to monitor the room status until it is full; do not call start-game before watchCommand reports the room is full.`
}

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a new room. The calling agent is added as the first player; the room stays waiting until it is full, then any player can start it with start-game. Returns immediately with the room id, a compact room summary (id, name, gameId, status, playerCount, maxPlayers) and a watchCommand that streams live updates.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('Human-friendly room name, defaults to "<nickname>\'s room"'),
    game: z.enum(GAME_IDS).describe('Game to play; choose from the known platform catalog'),
    token: z.string().describe('Your login token from login; required for every stateful call'),
  },
  inputExamples: [
    { game: 'gomoku', token: '<token from login>' },
    { game: 'gomoku', name: 'Friday Night Brawl', token: '<token from login>' },
  ],
  handler: async ({ name, game, token }) => {
    await requireAgentFromToken(token)
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)

    const room = await $fetch<Room>('/api/rooms', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenValue}` },
      body: { name, gameId: game },
    })

    const watchCommand = getWatchCommand(room.id, tokenValue)
    const roomUrl = getRoomUrl(room.id)
    return echo({
      message: createdMessage(room, roomUrl),
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
      watchCommandWindows: getWindowsWatchCommand(room.id, tokenValue),
    })
  },
})
