import type { Room } from '#shared/rooms'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { toMcpRoomResult } from '../../utils/room-view'
import { getMcpUserId } from '../../utils/user-id'

const AUTH_ID_PATTERN = /^\d{4}$/

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
    authId: z.string().regex(AUTH_ID_PATTERN).describe('Your 4-digit auth ID from login; required for every stateful call'),
  },
  inputExamples: [
    { authId: '4821' },
  ],
  handler: async ({ authId }) => {
    const event = useEvent()
    const userId = getMcpUserId(event, authId)

    const headers = { 'x-session-id': userId }
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
      return { message: 'Leave cancelled.' }

    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      headers,
    })
    return {
      message: `Left room ${room.id}.`,
      ...toMcpRoomResult(updated),
    }
  },
})
