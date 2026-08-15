import type { Room } from '#shared/rooms'
import { McpElicitationError } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomSummary } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Leave the room you are currently in: gives up your seat in a waiting room, or leaves a running match — the room is NOT aborted immediately; it stays playing for a short grace period and is only aborted (no winner) afterwards, so an accidental leave can be undone by rejoining the same room with join-room within that window. This asks the user to confirm before leaving; on clients without inline confirmation, pass confirmed: true only after the user has explicitly agreed.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().describe('Your login token from login; required for every stateful call'),
    confirmed: z.boolean().optional().describe('Set to true only after the human user explicitly agreed to leave. Leave unset when the client supports inline confirmation prompts; it is the fallback for clients that do not.'),
  },
  inputExamples: [
    { token: '<token from login>' },
    { token: '<token from login>', confirmed: true },
  ],
  handler: async ({ token, confirmed }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)
    const headers = { authorization: `Bearer ${tokenValue}` }

    const roomId = await getCurrentRoomId(userId)
    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)

    const prompt = room.status === 'playing'
      ? `Abandon the running game in room "${room.name}" (${room.id})? The match will be aborted with no winner.`
      : `Leave room "${room.name}" (${room.id})? You will give up your seat.`
    let promptShown = false
    let confirmedByUser = confirmed === true
    if (!confirmedByUser) {
      const elicit = useMcpElicitation()
      if (elicit.supports('form')) {
        try {
          promptShown = true
          confirmedByUser = await elicit.confirm(prompt)
        }
        catch (error) {
          if (error instanceof McpElicitationError && error.code === 'unsupported') {
            promptShown = false
          }
          else {
            throw createError({ statusCode: 409, statusMessage: 'Leaving a room requires user confirmation, but the confirmation prompt failed' })
          }
        }
      }
    }

    if (!confirmedByUser) {
      return echo(promptShown
        ? { message: 'Leave cancelled.' }
        : {
            message: 'This client does not support inline confirmation prompts. Ask the user whether they want to leave, then call leave-room again with confirmed: true only after they explicitly agree.',
            roomId: room.id,
            room: toMcpRoomSummary(room),
          })
    }

    const updated = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      headers,
    })
    const resumed = updated.pendingLeaveAt && updated.status === 'playing'
    const message = resumed
      ? `Left room ${updated.id}; the match is NOT over yet. It will be aborted with no winner unless you rejoin room ${updated.id} with join-room before the grace period ends.`
      : `Left room ${updated.id}.`
    return echo({
      message,
      roomId: updated.id,
      room: toMcpRoomSummary(updated),
      ...(resumed ? { rejoin: `Call join-room with roomId "${updated.id}" to cancel the abandonment and resume the match.` } : {}),
    })
  },
})
