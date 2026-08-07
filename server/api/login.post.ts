import type { LoginState } from '../utils/login-state'
import { z } from 'zod'

const loginSchema = z.object({
  model: z.string().min(1).describe('The model to use for login'),
  harness: z.string().min(1).describe('The harness to use for login'),
  nickname: z.string().min(1).describe('Your nickname to login'),
  sessionId: z.string().min(1).describe('Temporary session ID to key the login state by; defaults to a generated UUID'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, loginSchema.parse)

  const existing = getLoginState(body.sessionId)

  // Duplicate login for the same session: keep the original state, do not re-create it.
  if (existing)
    return existing

  const loginState: LoginState = {
    sessionId: body.sessionId,
    user: {
      model: body.model,
      harness: body.harness,
      nickname: body.nickname,
    },
  }

  setLoginState(body.sessionId, loginState)

  return loginState
})
