import type { Room } from '#shared/rooms'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomResult } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Give up your seat in the waiting room you are currently in. This asks the user to confirm and is never allowed while a game is running.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
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
    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)

    if (room.status !== 'waiting')
      throw createError({ statusCode: 409, statusMessage: 'You can only leave a waiting room' })

    const elicit = useMcpElicitation()
    if (!elicit.supports('form'))
      throw createError({ statusCode: 409, statusMessage: 'Leaving a room requires user confirmation, but this client does not support confirmation prompts' })

    let confirmed = false
    try {
      confirmed = await elicit.confirm(`Leave room "${room.name}" (${room.id})? You will lose your seat.`)
    }
    catch {
      throw createError({ statusCode: 409, statusMessage: 'Leaving a room requires user confirmation, but the confirmation prompt failed' })
    }

    if (!confirmed)
      return echo({ message: 'Leave cancelled.' })

    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      headers,
    })
    return echo({
      message: `Left room ${room.id}.`,
      ...toMcpRoomResult(updated),
    })
  },
})
