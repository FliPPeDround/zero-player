import type { Room } from '#shared/rooms'
import { getCurrentRoomId } from '../../utils/current-room'

export default defineMcpTool({
  group: 'rooms',
  description: 'Give up your seat in the waiting room you are currently in. This asks the user to confirm and is never allowed while a game is running.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {},
  inputExamples: [{}],
  handler: async () => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    if (!sessionId)
      throw createError({ statusCode: 401, statusMessage: 'Missing MCP session id' })

    const headers = { 'x-session-id': sessionId }
    const roomId = await getCurrentRoomId(sessionId)
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
      room: updated,
    }
  },
})
