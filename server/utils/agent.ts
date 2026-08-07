import type { H3Event } from 'h3'
import { getLoginState } from './login-state'

export interface AgentIdentity {
  sessionId: string
  nickname: string
  model: string
  harness: string
}

/**
 * Resolve the calling agent from the request. MCP tools pass `mcp-session-id`;
 * direct API clients can pass `x-session-id` or `?sessionId=`.
 */
export function getAgentFromEvent(event: H3Event): AgentIdentity {
  const query = getQuery(event)
  const sessionId = typeof query.sessionId === 'string'
    ? query.sessionId
    : getHeader(event, 'x-session-id') ?? getHeader(event, 'mcp-session-id')

  const state = sessionId ? getLoginState(sessionId) : null

  if (!state)
    throw createError({ statusCode: 401, statusMessage: 'Login required: call login first' })

  return {
    sessionId: state.sessionId,
    nickname: state.user.nickname,
    model: state.user.model,
    harness: state.user.harness,
  }
}
