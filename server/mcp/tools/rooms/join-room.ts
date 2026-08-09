import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Take a seat in a waiting room found through browse-rooms. The game starts automatically when the room becomes full.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3' },
  ],
  handler: async ({ roomId }) => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    const room = await $fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      headers: sessionId ? { 'x-session-id': sessionId } : undefined,
    })
    return {
      message: `Joined room ${room.id}; ${room.players.length}/${room.maxPlayers} players.`,
      room,
    }
  },
})
