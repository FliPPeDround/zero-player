import type { RoomStatus } from '#shared/rooms'
import { ROOM_MODES } from '#shared/rooms'
import { z } from 'zod'
import { listRooms } from '../../utils/room-store'

const querySchema = z.object({
  status: z.enum(['waiting', 'playing', 'finished'] as const satisfies readonly RoomStatus[]).optional(),
  gameId: z.string().min(1).optional(),
  mode: z.enum(ROOM_MODES).optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return await listRooms(query)
})
