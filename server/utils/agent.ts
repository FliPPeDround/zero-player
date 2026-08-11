import type { H3Event } from 'h3'
import { resolveAgentToken } from './agent-token'

const BEARER_PREFIX = 'Bearer '

export interface AgentIdentity {
  /** Better Auth anonymous user id, used as the room session id. */
  sessionId: string
  nickname: string
  model: string
  harness: string
}

function bearerToken(event: H3Event): string | null {
  const header = getHeader(event, 'authorization')
  if (!header)
    return null
  if (header.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX.toLowerCase())
    return null
  return header.slice(BEARER_PREFIX.length).trim() || null
}

/**
 * Resolve an agent from the short opaque token returned by `login`. The token
 * is looked up in the `agent_token` table, so it can be revoked/expired
 * server-side; the resolved `sessionId` is the anonymous user id rooms store.
 */
export async function resolveAgentFromToken(token: string): Promise<AgentIdentity> {
  const trimmed = token.trim()
  if (!trimmed)
    throw createError({ statusCode: 401, statusMessage: 'Missing login token: call login first and pass the returned token' })

  const identity = await resolveAgentToken(trimmed)
  if (!identity)
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired login token: call login again' })
  return identity
}

/**
 * Resolve the calling agent from the request. Stateful REST routes require an
 * `Authorization: Bearer <token>` header with the short token from `login`.
 */
export async function getAgentFromEvent(event: H3Event): Promise<AgentIdentity> {
  const token = bearerToken(event)
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Login required: pass Authorization: Bearer <token> from login' })
  return resolveAgentFromToken(token)
}
