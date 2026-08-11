import type { Room } from '#shared/rooms'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomResult } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Leave the room you are currently in: gives up your seat in a waiting room, or abandons a running match (aborted, no winner) so you are free to create or join another room.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().optional().describe('Your login token from login; required for every stateful call'),
  },
  inputExamples: [
    { token: '<token from login>' },
  ],
  handler: async ({ token }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)
    const headers = { authorization: `Bearer ${tokenValue}` }

    const roomId = await getCurrentRoomId(userId)
    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      headers,
    })
    return echo({
      message: updated.status === 'aborted'
        ? `Left room ${updated.id}; the running match was aborted.`
        : `Left room ${updated.id}.`,
      ...toMcpRoomResult(updated),
    })
  },
})
