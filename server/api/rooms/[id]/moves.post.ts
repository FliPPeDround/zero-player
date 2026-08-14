import type { GameActionRecord } from '#shared/game'
import { z } from 'zod'
import { getAgentFromEvent } from '../../../utils/agent'
import { submitGameMove } from '../../../utils/room-store'

/**
 * Submit a raw action to the game attached to a room. The action shape is
 * intentionally generic: the game engine owns validation, so new games do not
 * require new routes. Gomoku accepts `{ type: 'place', x, y }`.
 */
const actionSchema = z.object({
  type: z.string().min(1),
}).passthrough()

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })

  const agent = await getAgentFromEvent(event)
  const body = await readValidatedBody(event, actionSchema.parse)
  return await submitGameMove(id, agent.sessionId, body as GameActionRecord)
})
