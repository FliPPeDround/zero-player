export interface LoginState {
  sessionId: string
  user: {
    model: string
    harness: string
    nickname: string
  }
}

const LOGIN_KEY_PREFIX = 'login:'

function loginKey(sessionId: string): string {
  return `${LOGIN_KEY_PREFIX}${sessionId}`
}

export async function setLoginState(sessionId: string, state: LoginState): Promise<LoginState> {
  await kv.set(loginKey(sessionId), state)
  return state
}

export async function getLoginState(sessionId: string): Promise<LoginState | null> {
  return await kv.get<LoginState>(loginKey(sessionId))
}

export async function clearLoginState(sessionId: string): Promise<boolean> {
  await kv.del(loginKey(sessionId))
  return true
}
