import type { AgentIdentity } from './agent'
import process from 'node:process'
import { eq, lt } from 'drizzle-orm'

/**
 * Short opaque token minted by `POST /api/agent/login` and echoed by the AI
 * on every stateful call. Deliberately much shorter than a JWT: the agent has
 * to reproduce it verbatim, so we trade a per-request DB lookup for copy
 * reliability. Collision resistance is overkill for a handful of temporary
 * sessions, but 62^12 leaves plenty of margin anyway.
 */
const AGENT_TOKEN_LENGTH = 12
const AGENT_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const tokenTtlDays = Number(process.env.AGENT_TOKEN_TTL_DAYS || 30)

/**
 * Cryptographically random token via Web Crypto (`crypto.getRandomValues`,
 * the same primitive Better Auth uses). Rejection sampling keeps the
 * distribution uniform.
 */
export function generateAgentToken(): string {
  const maxValid = Math.floor(256 / AGENT_TOKEN_ALPHABET.length) * AGENT_TOKEN_ALPHABET.length
  const buf = new Uint8Array(AGENT_TOKEN_LENGTH * 2)
  let result = ''
  let bufIndex = buf.length
  while (result.length < AGENT_TOKEN_LENGTH) {
    if (bufIndex >= buf.length) {
      crypto.getRandomValues(buf)
      bufIndex = 0
    }
    const rand = buf[bufIndex++]!
    if (rand < maxValid)
      result += AGENT_TOKEN_ALPHABET[rand % AGENT_TOKEN_ALPHABET.length]
  }
  return result
}

/**
 * Persist a fresh token for an anonymous user and return it to the caller.
 * Tokens are one-shot per login: re-login mints a new identity, like before.
 */
export async function issueAgentToken(userId: string): Promise<string> {
  const token = generateAgentToken()
  const expiresAt = new Date(Date.now() + tokenTtlDays * 24 * 60 * 60 * 1000)
  await db.insert(schema.agentToken).values({ token, userId, expiresAt })
  return token
}

/**
 * Resolve a short token to the agent identity (the anonymous user row it was
 * minted for). Returns null when the token is unknown, expired, or its user
 * no longer exists; expired/orphaned rows are deleted lazily.
 */
export async function resolveAgentToken(token: string): Promise<AgentIdentity | null> {
  const tokenRows = await db
    .select()
    .from(schema.agentToken)
    .where(eq(schema.agentToken.token, token))
    .limit(1)
  const tokenRow = tokenRows[0]
  if (!tokenRow)
    return null

  if (tokenRow.expiresAt.getTime() <= Date.now()) {
    await db.delete(schema.agentToken).where(eq(schema.agentToken.token, token))
    return null
  }

  const userRows = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, tokenRow.userId))
    .limit(1)
  const user = userRows[0]
  if (!user) {
    await db.delete(schema.agentToken).where(eq(schema.agentToken.token, token))
    return null
  }

  return {
    sessionId: user.id,
    nickname: user.name,
    model: user.model || 'unknown',
    harness: user.harness || 'unknown',
  }
}

/** Delete expired tokens; called by the scheduled cleanup task. */
export async function purgeExpiredAgentTokens(): Promise<number> {
  const result = await db
    .delete(schema.agentToken)
    .where(lt(schema.agentToken.expiresAt, new Date()))
    .run()
  return result.rowsAffected
}
