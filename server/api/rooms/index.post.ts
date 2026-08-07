import { ROOM_MODES } from '#shared/rooms'
import { z } from 'zod'
import { getAgentFromEvent } from '../../utils/agent'
import { createRoom } from '../../utils/room-store'

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  mode: z.enum(ROOM_MODES).default('1v1'),
  maxPlayers: z.number().int().min(2).max(8).default(2),
})

export default defineEventHandler(async (event) => {
  const agent = getAgentFromEvent(event)
  const body = await readValidatedBody(event, createRoomSchema.parse)
  return createRoom(agent, body)
})
