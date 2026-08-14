import { getAgentFromEvent } from '../../../utils/agent'
import { joinRoom } from '../../../utils/room-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  const agent = await getAgentFromEvent(event)
  return await joinRoom(id, agent)
})
