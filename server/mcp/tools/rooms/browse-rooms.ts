import { GAME_IDS } from '#shared/games'
import { z } from 'zod'
import { resolveAgentFromToken } from '../../../utils/agent'
import { withTokenEcho } from '../../utils/identity'

export default defineMcpTool({
  group: 'rooms',
  description: 'List rooms in the lobby, optionally filtered by game, status, name or player. Returns compact room summaries — pick a waiting room and join it with join-room. Read-only; no login required (a token is optional and only echoed back).',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    status: z.enum(['waiting', 'playing', 'finished', 'aborted']).optional().describe('Only show rooms in this status; omit for all'),
    game: z.enum(GAME_IDS).optional().describe('Only show rooms for this game'),
    search: z.string().max(100).optional().describe('Match rooms by name, id, or player nickname'),
    limit: z.number().int().min(1).max(100).optional().describe('Max rooms to return (default 100)'),
    token: z.string().optional().describe('Your login token from login, if you have one (optional; echoed back unchanged)'),
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
