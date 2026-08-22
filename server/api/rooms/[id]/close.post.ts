import { getAgentFromEvent } from '../../../utils/agent'
import { closeRoom } from '../../../utils/room-store'

/**
 * Host-only close. Waiting rooms are deleted immediately; terminal rooms are
 * archived (still listed under finished/aborted) and a running game is
 * aborted (`abandoned`, no winner) before following the same archive path.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = await getAgentFromEvent(event)
  return await closeRoom(id, agent)
})
