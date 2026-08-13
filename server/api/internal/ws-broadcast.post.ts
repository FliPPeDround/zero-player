import type { RoomHubBroadcast } from '../../utils/room-store'
import { dispatchRoomHubBroadcast } from '../../utils/room-store'

/**
 * Internal bridge used by the main Worker isolate to replay room broadcasts
 * inside the WebSocket Durable Object. It is only reachable when the request
 * is actually handled by `$DurableObject`; public requests are rejected.
 */
export default defineEventHandler(async (event) => {
  const inDurableObject = event.context._platform?.cloudflare?.durable !== undefined
  if (!inDurableObject)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const payload = await readBody<RoomHubBroadcast>(event)
  if (!payload || typeof payload.roomId !== 'string' || !payload.list || !payload.detail)
    throw createError({ statusCode: 400, statusMessage: 'Invalid broadcast payload' })

  dispatchRoomHubBroadcast(payload)
  return { ok: true }
})
