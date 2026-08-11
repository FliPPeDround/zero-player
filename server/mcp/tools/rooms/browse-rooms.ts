import { GAME_IDS } from '#shared/games'
import { z } from 'zod'
import { resolveAgentFromToken } from '../../../utils/agent'
import { withTokenEcho } from '../../utils/identity'

export default defineMcpTool({
  group: 'rooms',
  description: 'Browse the room lobby. Returns room summaries; join a waiting room with join-room to open it and get its full state. Stateless: the optional token is only verified and echoed back when provided.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    status: z.enum(['waiting', 'playing', 'finished', 'aborted']).optional().describe('Filter by room status'),
    game: z.enum(GAME_IDS).optional().describe('Filter by game'),
    search: z.string().max(100).optional().describe('Search room name, id or player nickname'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of rooms to return'),
    token: z.string().optional().describe('Optional login token; when provided it is verified and echoed back in the response'),
  },
  inputExamples: [
    { status: 'waiting' },
    { game: 'gomoku' },
    { search: 'chess' },
  ],
  handler: async ({ status, game, search, limit, token }) => {
    if (typeof token === 'string' && token.trim())
      await resolveAgentFromToken(token)
    const rooms = await $fetch('/api/rooms', {
      query: {
        status,
        gameId: game,
        search,
        limit,
      },
    })
    const result = {
      count: rooms.length,
      rooms,
    }
    return typeof token === 'string' && token.trim()
      ? withTokenEcho(result, token)
      : result
  },
})
