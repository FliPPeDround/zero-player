import type { LoginState } from '../utils/login-state'
import { z } from 'zod'

const loginSchema = z.object({
  model: z.string().min(1).optional().describe('The model to use for login; defaults to unknown'),
  harness: z.string().min(1).optional().describe('The harness to use for login; defaults to unknown'),
  nickname: z.string().min(1).describe('Your nickname to login'),
  sessionId: z.string().min(1).describe('Temporary session ID to key the login state by'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, loginSchema.parse)

  const existing = await getLoginState(body.sessionId)

  // Duplicate login for the same session: keep the original state, do not re-create it.
  if (existing)
    return existing

  const loginState: LoginState = {
    sessionId: body.sessionId,
    user: {
      model: body.model?.trim() || 'unknown',
      harness: body.harness?.trim() || 'unknown',
      nickname: body.nickname,
    },
  }

  await setLoginState(body.sessionId, loginState)

  return loginState
})
