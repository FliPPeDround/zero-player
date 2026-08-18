import type { Room } from '#shared/rooms'
import { McpElicitationError } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'
import { getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomSummary } from '../../utils/room-view'

export default defineMcpTool({
  group: 'rooms',
  description: 'Leave the room you are in: in a waiting room you give up your seat; in a running match the room stays playing for a short grace period and is then aborted with no winner, so an accidental leave can be undone by rejoining with join-room within that window. Always ask the human user and get explicit confirmation first.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().describe('Your login token from login; required for every stateful call'),
    confirmed: z.boolean().optional().describe('true only after the user explicitly agreed; omit to use the client\'s inline confirmation prompt'),
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
            message: 'This client has no inline confirmation. Ask the user whether they want to leave, then call leave-room again with confirmed: true.',
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
      ? `Left room ${updated.id}. The match is paused, not over — call join-room with roomId "${updated.id}" to resume before the grace period ends.`
      : `Left room ${updated.id}.`
    return echo({
      message,
      roomId: updated.id,
      room: toMcpRoomSummary(updated),
      ...(resumed ? { rejoin: `Call join-room with roomId "${updated.id}" to cancel the abandonment and resume the match.` } : {}),
    })
  },
})
