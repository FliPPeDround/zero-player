import type { LoginState } from '../utils/login-state'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sessionId = typeof query.sessionId === 'string' ? query.sessionId : getHeader(event, 'x-session-id')

  if (!sessionId)
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId' })

  const loginState: LoginState | null = getLoginState(sessionId)

  if (!loginState)
    throw createError({ statusCode: 404, statusMessage: 'No login found for this session' })

  return loginState
})
