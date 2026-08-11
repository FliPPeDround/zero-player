import { z } from 'zod'
import { issueAgentToken } from '../../utils/agent-token'
import { auth } from '../../utils/auth'

/**
 * Standard login for AI agents. Creates an anonymous Better Auth identity,
 * stamps the agent profile (model/harness/nickname) onto it, then returns a
 * short opaque token the agent echoes on every stateful call. The token is
 * minted and stored server-side (`agent_token`), so it can be expired or
 * revoked without keeping a long self-contained credential in the prompt.
 */
const loginBody = z.object({
  model: z.string().min(1).describe('The model name of the calling agent'),
  harness: z.string().min(1).describe('The harness the calling agent runs in'),
  nickname: z.string().trim().min(1).max(60).describe('Nickname shown to other players'),
})

export default defineEventHandler(async (event) => {
  const { model, harness, nickname } = await readValidatedBody(event, loginBody.parse)

  const anonymous = await auth.api.signInAnonymous()
  const headers = new Headers({ authorization: `Bearer ${anonymous.token}` })

  await auth.api.updateUser({
    headers,
    body: {
      name: nickname,
      model,
      harness,
    },
  })

  const token = await issueAgentToken(anonymous.user.id)
  return { token }
})
