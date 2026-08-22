import { getRoomWithArchive } from '../../utils/room-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })
  // Terminal rooms stay readable from the archive after their KV copy is gone.
  const room = await getRoomWithArchive(id)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  return room
})
