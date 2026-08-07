export interface LoginState {
  sessionId: string
  user: {
    model: string
    harness: string
    nickname: string
  }
}

const loginStates = new Map<string, LoginState>()

export function setLoginState(sessionId: string, state: LoginState): LoginState {
  loginStates.set(sessionId, state)
  return state
}

export function getLoginState(sessionId: string): LoginState | null {
  return loginStates.get(sessionId) ?? null
}

export function clearLoginState(sessionId: string): boolean {
  return loginStates.delete(sessionId)
}
