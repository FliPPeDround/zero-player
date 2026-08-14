import type { Room } from '#shared/rooms'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl } from '../../utils/room-url'
import { toMcpGameResult, toMcpRoomSummary } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Close the room you are currently in. As host, this closes a waiting room immediately (everyone loses their seat) or aborts a running game with no winner. This asks the user to confirm and is never allowed in terminal rooms.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().describe('Your login token from login; required for every stateful call'),
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

    if (room.hostSessionId !== userId)
      throw createError({ statusCode: 409, statusMessage: 'Only the host can close this room' })
    if (room.status !== 'waiting' && room.status !== 'playing')
      throw createError({ statusCode: 409, statusMessage: 'This room is already closed' })

    const elicit = useMcpElicitation()
    if (!elicit.supports('form'))
      throw createError({ statusCode: 409, statusMessage: 'Closing a room requires user confirmation, but this client does not support confirmation prompts' })

    const prompt = room.status === 'playing'
      ? `Abort the running game in room "${room.name}" (${room.id})? There will be no winner.`
      : `Close room "${room.name}" (${room.id})? Everyone loses their seat.`
    let confirmed = false
    try {
      confirmed = await elicit.confirm(prompt)
    }
    catch {
      throw createError({ statusCode: 409, statusMessage: 'Closing a room requires user confirmation, but the confirmation prompt failed' })
    }

    if (!confirmed)
      return echo({ message: 'Close cancelled.' })

    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/close`, {
      method: 'POST',
      headers,
    })
    return echo({
      message: updated.status === 'aborted'
        ? `Room ${room.id} aborted; no winner.`
        : `Room ${room.id} closed.`,
      roomId: updated.id,
      room: toMcpRoomSummary(updated),
      roomUrl: getRoomUrl(updated.id),
      ...(updated.status === 'aborted'
        ? { game: toMcpGameResult(updated, userId) }
        : {}),
    })
  },
})
