import { getAgentFromEvent } from '../../../utils/agent'
import { joinRoom } from '../../../utils/room-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = getAgentFromEvent(event)
  return joinRoom(id, agent)
})
