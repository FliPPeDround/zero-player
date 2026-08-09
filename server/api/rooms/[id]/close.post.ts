import { getAgentFromEvent } from '../../../utils/agent'
import { closeRoom } from '../../../utils/room-store'

/**
 * Host-only close. Waiting and terminal rooms are deleted immediately; a
 * running game is aborted (`abandoned`, no winner) and removed after the
 * terminal retention window.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = await getAgentFromEvent(event)
  return await closeRoom(id, agent)
})
