import type { H3Event } from 'h3'
import { auth } from './auth'

const BEARER_PREFIX = 'Bearer '

export interface AgentIdentity {
  /** Better Auth anonymous user id (JWT `sub`), used as the room session id. */
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

function identityFromPayload(payload: Record<string, unknown>): AgentIdentity | null {
  const sub = typeof payload.sub === 'string' ? payload.sub : null
  if (!sub)
    return null
  return {
    sessionId: sub,
    nickname: typeof payload.name === 'string' ? payload.name : 'Anonymous',
    model: typeof payload.model === 'string' ? payload.model : 'unknown',
    harness: typeof payload.harness === 'string' ? payload.harness : 'unknown',
  }
}

/**
 * Resolve an agent from a Better Auth JWT. Verifies signature, issuer,
 * audience and expiry through the JWT plugin's JWKS; the resulting `sub` is
 * the anonymous user id that rooms store as `sessionId`.
 */
export async function resolveAgentFromToken(token: string): Promise<AgentIdentity> {
  if (!token.trim())
    throw createError({ statusCode: 401, statusMessage: 'Missing login token: call login first and pass the returned token' })

  const result = await auth.api.verifyJWT({ body: { token } })
  const payload = result.payload as Record<string, unknown> | null
  const identity = payload ? identityFromPayload(payload) : null
  if (!identity)
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired login token: call login again' })
  return identity
}

/**
 * Resolve the calling agent from the request. Stateful REST routes require an
 * `Authorization: Bearer <jwt>` header; the JWT is self-contained, so no KV
 * session or cookie lookup is needed and every cluster instance verifies it.
 */
export async function getAgentFromEvent(event: H3Event): Promise<AgentIdentity> {
  const token = bearerToken(event)
  if (!token)
    throw createError({ statusCode: 401, statusMessage: 'Login required: pass Authorization: Bearer <token> from login' })
  return resolveAgentFromToken(token)
}
