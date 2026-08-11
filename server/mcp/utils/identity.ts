import type { AgentIdentity } from '../../utils/agent'
import { resolveAgentFromToken } from '../../utils/agent'

/**
 * Resolve the caller of a stateful MCP tool from the `token` argument. The
 * token is a short opaque token issued by the `login` tool; every stateful
 * response echoes it back so stateless clients never lose their identity.
 */
export async function requireAgentFromToken(token: unknown): Promise<AgentIdentity> {
  if (typeof token !== 'string' || !token.trim())
    throw createError({ statusCode: 401, statusMessage: 'Missing login token: call login first and pass the returned token' })
  return resolveAgentFromToken(token)
}

/**
 * Merge the caller's token into a tool result. Used on every stateful tool
 * branch (including timeouts, cancellations and room closures) and on
 * stateless tools when a token was provided, so the agent can keep echoing it.
 */
export function withTokenEcho<T extends Record<string, unknown>>(
  result: T,
  token: string,
): T & { token: string } {
  return { token, ...result }
}
