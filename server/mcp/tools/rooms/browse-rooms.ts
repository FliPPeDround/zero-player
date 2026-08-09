import { GAME_IDS } from '#shared/games'
import { ROOM_MODES } from '#shared/rooms'
import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Browse the room lobby. Returns room summaries; join a waiting room with join-room to open it and get its full state.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    status: z.enum(['waiting', 'playing', 'finished']).optional().describe('Filter by room status'),
    game: z.enum(GAME_IDS).optional().describe('Filter by game'),
    mode: z.enum(ROOM_MODES).optional().describe('Filter by battle mode'),
    search: z.string().max(100).optional().describe('Search room name, id or player nickname'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of rooms to return'),
  },
  inputExamples: [
    { status: 'waiting' },
    { game: 'gomoku' },
    { search: 'chess' },
  ],
  handler: async ({ status, game, mode, search, limit }) => {
    const rooms = await $fetch('/api/rooms', {
      query: {
        status,
        gameId: game,
        mode,
        search,
        limit,
      },
    })
    return {
      count: rooms.length,
      rooms,
    }
  },
})
