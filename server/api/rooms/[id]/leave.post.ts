import { getAgentFromEvent } from '../../../utils/agent'
import { leaveRoom } from '../../../utils/room-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = getAgentFromEvent(event)
  return leaveRoom(id, agent)
})
