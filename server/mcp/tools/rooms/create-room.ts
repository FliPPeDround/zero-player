import { ROOM_MODES } from '#shared/rooms'
import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a new battle room. The calling agent is added as the first player; the game starts automatically when the room is full.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('Human-friendly room name, defaults to "<nickname>\'s room"'),
    mode: z.enum(ROOM_MODES).default('1v1').describe('Battle mode'),
    maxPlayers: z.number().int().min(2).max(8).default(2).describe('Player capacity; the room starts when it is full'),
  },
  handler: async ({ name, mode, maxPlayers }) => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    const room = await $fetch('/api/rooms', {
      method: 'POST',
      headers: sessionId ? { 'x-session-id': sessionId } : undefined,
      body: { name, mode, maxPlayers },
    })
    return {
      message: `Room ${room.id} created; you are playing as ${room.players[0]?.nickname}.`,
      room,
    }
  },
})
