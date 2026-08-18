import type { Room } from '#shared/rooms'
import { GAME_IDS, getGameName } from '#shared/games'
import { z } from 'zod'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand } from '../../utils/room-url'
import { toMcpRoomSummary } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a room for a game and take the first seat. Returns immediately with the room id, a compact summary, a spectator link, and a watchCommand to keep streaming until the match ends. The game starts only after the room is full and every player has called start-game.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('Room name; defaults to "<nickname>\'s room"'),
    game: z.enum(GAME_IDS).describe('The game to play, from the platform catalog'),
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
      message: `Room "${room.name}" (${getGameName(room.gameId)}) created — waiting for an opponent to join. Keep the watchCommand streaming; it will tell you when the room is full.`,
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
    })
  },
})
