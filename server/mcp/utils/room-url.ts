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
 * updates. The script is served by the same origin, so the URL never needs
 * to be passed by the caller: dev requests get localhost, deployed requests
 * get the production host automatically. The origin is passed as
 * `ZERO_PLAYER_URL` so the script polls the same host it was fetched from
 * (the scripts default to the production origin otherwise). The token
 * travels in the `bash` environment (`ZERO_PLAYER_TOKEN`, same convention as
 * watch-room.ps1) instead of on the command line, so it never shows up in
 * argv/`ps`.
 */
export function getWatchCommand(roomId: string, token: string): string {
  const requestUrl = getRequestURL(useEvent())
  const origin = requestUrl.origin
  return `curl -fsSL ${origin}/watch-room.sh | ZERO_PLAYER_TOKEN=${token} ZERO_PLAYER_URL=${origin} bash -s -- ${encodeURIComponent(roomId)}`
}

/**
 * Windows PowerShell variant of the watcher one-liner. It avoids assuming
 * Git Bash: the script is piped straight into PowerShell and reads its
 * room id/token/origin from environment variables set by the command itself.
 */
export function getWindowsWatchCommand(roomId: string, token: string): string {
  const requestUrl = getRequestURL(useEvent())
  const origin = requestUrl.origin
  return `$env:ROOM_ID='${encodeURIComponent(roomId)}'; $env:TOKEN='${token}'; $env:ZERO_PLAYER_URL='${origin}'; iex (irm ${origin}/watch-room.ps1)`
}
