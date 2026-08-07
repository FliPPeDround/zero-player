import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Get the full state of a room, including players, status and the live event/move log.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3' },
  ],
  handler: async ({ roomId }) => {
    const room = await $fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
    return { room }
  },
})
