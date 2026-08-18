import { getRequestURL } from 'h3'

/**
 * Public spectator URL for a room, derived from the origin of the current
 * request. `/rooms/:id` is the browser page humans use to watch a match.
 */
export function getRoomUrl(roomId: string): string {
  const requestUrl = getRequestURL(useEvent())
  return `${requestUrl.origin}/rooms/${encodeURIComponent(roomId)}`
}

/**
 * One-line watcher command returned by MCP tools that need to wait for room
 * updates. It connects directly to the public SSE endpoint
 * `GET /api/rooms/:id/events` and streams frames to the terminal as they
 * arrive (`-N` disables buffering), so an agent can read live room state and
 * action hints without any helper script. The origin is derived from the
 * current request, so dev requests get localhost and deployed requests get
 * the production host automatically. The token is sent as an `Authorization`
 * bearer header, matching how the REST and MCP tools authenticate.
 *
 * The stream is a whole-match listener: it keeps pushing waiting-room
 * snapshots, `gameStarted` and turn updates, and only exits when the game
 * ends, the room closes, or the server closes the stream.
 */
export function getWatchCommand(roomId: string, token: string): string {
  const requestUrl = getRequestURL(useEvent())
  const origin = requestUrl.origin
  return `curl -fsSL -N -H 'Authorization: Bearer ${token}' ${origin}/api/rooms/${encodeURIComponent(roomId)}/events`
}
