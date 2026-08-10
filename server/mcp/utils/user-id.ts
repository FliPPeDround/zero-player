import type { H3Event } from 'h3'

const AUTH_ID_PATTERN = /^\d{4}$/

/**
 * Compose the composite user id for the current MCP request: the raw
 * `mcp-session-id` header plus the 4-digit `authId` the agent received at
 * login. The composite id is opaque to REST — it just looks like a longer
 * session id — so dialogs sharing the same client session stay distinct.
 */
export function getMcpUserId(event: H3Event, authId: unknown): string {
  const sessionId = getHeader(event, 'mcp-session-id')
  if (!sessionId)
    throw createError({ statusCode: 401, statusMessage: 'Missing MCP session id' })
  if (typeof authId !== 'string' || !AUTH_ID_PATTERN.test(authId))
    throw createError({ statusCode: 400, statusMessage: 'Invalid authId: expected the 4-digit auth ID returned by login' })
  return `${sessionId}-${authId}`
}
