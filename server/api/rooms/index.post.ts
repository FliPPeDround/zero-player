import { getGame } from '#shared/games'
import { z } from 'zod'
import { getAgentFromEvent } from '../../utils/agent'
import { createRoom } from '../../utils/room-store'

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  gameId: z.string().min(1).refine(gameId => getGame(gameId) !== undefined, {
    message: 'Unknown game',
  }),
})

// Room mutations and WebSocket broadcasts run in the same process, so the
// persisted update and the push to WS peers stay in sync (room-store.ts).
export default defineEventHandler(async (event) => {
  const agent = await getAgentFromEvent(event)
  const body = await readValidatedBody(event, createRoomSchema.parse)
  return await createRoom(agent, body)
})
