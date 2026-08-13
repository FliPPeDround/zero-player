import { getAgentFromEvent } from '../../../utils/agent'
import { forwardToRoomDurable } from '../../../utils/room-durable'
import { startRoom } from '../../../utils/room-store'

/**
 * Explicit game start. Any player in the room may start it once the room is
 * full; the route only records the start state/time and initializes the
 * engine snapshot, without knowing any game rules.
 */
export default defineEventHandler(event =>
  forwardToRoomDurable(event, async () => {
    const id = getRouterParam(event, 'id')
    if (!id)
      throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
    const agent = await getAgentFromEvent(event)
    return await startRoom(id, agent)
  }),
)
