import type { Room } from '#shared/rooms'
import { getCurrentRoomId } from '../../utils/current-room'

export default defineMcpTool({
  group: 'rooms',
  description: 'Close the room you are currently in. As host, this closes a waiting room immediately (everyone loses their seat) or aborts a running game with no winner. This asks the user to confirm and is never allowed in terminal rooms.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
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

    if (room.hostSessionId !== sessionId)
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
      return { message: 'Close cancelled.' }

    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/close`, {
      method: 'POST',
      headers,
    })
    return {
      message: updated.status === 'aborted'
        ? `Room ${room.id} aborted; no winner.`
        : `Room ${room.id} closed.`,
      room: updated,
    }
  },
})
