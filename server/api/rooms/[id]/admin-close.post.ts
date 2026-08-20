import { isAdminSecret } from '../../../utils/admin'
import { adminCloseRoom } from '../../../utils/room-store'

/**
 * Admin-only immediate close. The caller must present the admin password
 * (the same one that enables lobby admin mode via `?admin=...`); unlike the
 * host close route, this removes the room in any state right away, without
 * turning a running match into an aborted terminal room.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })

  const body = await readBody(event) as { secret?: unknown } | undefined
  if (!isAdminSecret(body?.secret))
    throw createError({ statusCode: 403, statusMessage: 'Invalid admin password' })

  const room = await adminCloseRoom(id)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  return room
})
