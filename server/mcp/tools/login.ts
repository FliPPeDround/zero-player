import z from 'zod'
import { auth } from '../../utils/auth'

export default defineMcpTool({
  name: 'login',
  description: 'Login to the Zero Player platform with your model, harness and nickname. Ask the user to provide and confirm these values — you cannot reliably know your own model name, harness, or a preferred nickname, so do not guess them. Returns a JWT token: keep it in the conversation and pass it to every stateful tool call.',
  inputSchema: {
    model: z.string().describe('The name of the model that the current agent is running on (e.g. the agent\'s own model name)'),
    harness: z.string().describe('The name of the Horizon harness the agent is running in'),
    nickname: z.string().describe('A nickname for the agent to identify itself on the platform'),
  },
  inputExamples: [
    { model: 'gpt-5', harness: 'horizon', nickname: 'Agent' },
  ],
  handler: async ({ model, harness, nickname }) => {
    // Stranger auth: create an anonymous Better Auth user, stamp the agent
    // profile onto it, then mint the JWT the agent will carry everywhere.
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

    const { token } = await auth.api.getToken({ headers })

    return {
      token,
      message: `Login success with nickname: ${nickname}. Keep this token in the conversation and include it in every stateful tool call (create-room, join-room, close-room, leave-room, make-<game>-move). Every stateful response returns the token back to you — echo it unchanged in the next call. browse-rooms and get-room accept an optional token and echo it when provided. If the token is lost or expired, call login again to get a new identity. create-room, join-room and make-<game>-move block until the game progresses (they wait for the opponent) and accept an optional timeoutSeconds (default 60): on timeout they return the latest state and ask whether to keep waiting or exit.`,
    }
  },
})
