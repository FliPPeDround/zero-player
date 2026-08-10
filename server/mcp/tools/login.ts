import z from 'zod'

const AUTH_ID_PATTERN = /^\d{4}$/
const AUTH_ID_ATTEMPTS = 1000

function randomAuthId(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

/**
 * A composite id is taken when `GET /api/login` finds an existing login for
 * it. Any other failure is unexpected and propagates.
 */
async function isCompositeIdTaken(compositeId: string): Promise<boolean> {
  try {
    await $fetch('/api/login', {
      query: { sessionId: compositeId },
    })
    return true
  }
  catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404)
      return false
    throw error
  }
}

async function allocateAuthId(sessionId: string): Promise<string> {
  for (let attempts = 0; attempts < AUTH_ID_ATTEMPTS; attempts++) {
    const candidate = randomAuthId()
    if (!(await isCompositeIdTaken(`${sessionId}-${candidate}`)))
      return candidate
  }
  throw createError({ statusCode: 409, statusMessage: 'Could not allocate a unique auth ID for this session' })
}

export default defineMcpTool({
  name: 'login',
  description: 'Login to the Zero Player platform with your model, harness and nickname. Ask the user to provide and confirm these values — you cannot reliably know your own model name, harness, or a preferred nickname, so do not guess them.',
  inputSchema: {
    model: z.string().describe('The name of the model that the current agent is running on (e.g. the agent\'s own model name)'),
    harness: z.string().describe('The name of the Horizon harness the agent is running in'),
    nickname: z.string().describe('A nickname for the agent to identify itself on the platform'),
    authId: z.string().regex(AUTH_ID_PATTERN).optional().describe('Your 4-digit auth ID from a previous login; pass it to keep the same identity. Omit it to create a new identity.'),
  },
  handler: async ({ model, harness, nickname, authId }) => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    if (!sessionId)
      throw createError({ statusCode: 401, statusMessage: 'Missing MCP session id' })

    const finalAuthId = authId ?? await allocateAuthId(sessionId)

    // REST is idempotent per session id: re-login with an existing composite
    // id returns the original login state, so room membership is preserved.
    await $fetch('/api/login', {
      method: 'POST',
      body: { model, harness, nickname, sessionId: `${sessionId}-${finalAuthId}` },
    })

    return {
      authId: finalAuthId,
      message: `Login success with nickname: ${nickname}. Your 4-digit auth ID is ${finalAuthId} — include it in every stateful tool call (create-room, join-room, get-room, close-room, leave-room, make-<game>-move). create-room, join-room and make-<game>-move block until the game progresses (they wait for the opponent) and accept an optional timeoutSeconds (default 60): on timeout they return the latest state and ask whether to keep waiting or exit. To re-login with the same identity, pass this auth ID to login again.`,
    }
  },
})
