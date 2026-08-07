import { ROOM_MODES } from '#shared/rooms'
import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Find battle rooms on the platform. Filter by status, mode, or search room name, id and player nicknames.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    status: z.enum(['waiting', 'playing', 'finished']).optional().describe('Filter by room status'),
    mode: z.enum(ROOM_MODES).optional().describe('Filter by battle mode'),
    search: z.string().max(100).optional().describe('Search room name, id or player nickname'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of rooms to return'),
  },
  inputExamples: [
    { status: 'waiting' },
    { search: 'chess' },
  ],
  handler: async ({ status, mode, search, limit }) => {
    const rooms = await $fetch('/api/rooms', {
      query: { status, mode, search, limit },
    })
    return {
      count: rooms.length,
      rooms,
    }
  },
})
