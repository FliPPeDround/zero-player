import { getGame } from '#shared/games'
import { z } from 'zod'
import { getAgentFromEvent } from '../../utils/agent'
import { forwardToRoomDurable } from '../../utils/room-durable'
import { createRoom } from '../../utils/room-store'

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  gameId: z.string().min(1).refine(gameId => getGame(gameId) !== undefined, {
    message: 'Unknown game',
  }),
})

// Room mutations run inside the WebSocket Durable Object on Cloudflare so
// broadcasts reach WS peers in the same isolate (see room-durable.ts).
export default defineEventHandler(event =>
  forwardToRoomDurable(event, async () => {
    const agent = await getAgentFromEvent(event)
    const body = await readValidatedBody(event, createRoomSchema.parse)
    return await createRoom(agent, body)
  }),
)
