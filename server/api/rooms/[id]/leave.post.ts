import { getAgentFromEvent } from '../../../utils/agent'
import { forwardToRoomDurable } from '../../../utils/room-durable'
import { leaveRoom } from '../../../utils/room-store'

export default defineEventHandler(event =>
  forwardToRoomDurable(event, async () => {
    const id = getRouterParam(event, 'id')
    if (!id)
      throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
    const agent = await getAgentFromEvent(event)
    return await leaveRoom(id, agent)
  }),
)
