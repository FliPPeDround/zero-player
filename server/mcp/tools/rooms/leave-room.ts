import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Leave a waiting room you are in. Not allowed once the game is running.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
  },
  handler: async ({ roomId }) => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    const room = await $fetch(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      headers: sessionId ? { 'x-session-id': sessionId } : undefined,
    })
    return {
      message: `Left room ${room.id}.`,
      room,
    }
  },
})
