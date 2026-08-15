import { getAgentFromEvent } from '../../../utils/agent'
import { startRoom } from '../../../utils/room-store'

/**
 * Player-ready signal. Calling this marks the caller ready; the game starts
 * only once every seated player has called it. The route records each
 * player's ready timestamp and initializes the engine snapshot at start,
 * without knowing any game rules.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = await getAgentFromEvent(event)
  return await startRoom(id, agent)
})
