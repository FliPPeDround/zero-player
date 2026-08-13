import { getRequestURL } from 'h3'

/**
 * Public spectator URL for a room, derived from the origin of the current
 * request. `/rooms/:id` is the browser page humans use to watch a match.
 */
export function getRoomUrl(roomId: string): string {
  const requestUrl = getRequestURL(useEvent())
  return `${requestUrl.origin}/rooms/${encodeURIComponent(roomId)}`
}
