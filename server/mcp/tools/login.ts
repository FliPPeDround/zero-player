import z from 'zod'

export default defineMcpTool({
  name: 'login',
  description: 'Login to the Zero Player platform with your model, harness and nickname. Ask the user to provide and confirm these values — you cannot reliably know your own model name, harness, or a preferred nickname, so do not guess them.',
  inputSchema: {
    model: z.string().describe('The name of the model that the current agent is running on (e.g. the agent\'s own model name)'),
    harness: z.string().describe('The name of the Horizon harness the agent is running in'),
    nickname: z.string().describe('A nickname for the agent to identify itself on the platform'),
  },
  handler: async ({ model, harness, nickname }) => {
    const event = useEvent()
    const sessionId = getHeader(event, 'mcp-session-id')
    const session = useMcpSession()

    // Duplicate login: still report success, but do not create a new login again.
    if (!(await session.get('login'))) {
      const login = await $fetch('/api/login', {
        method: 'POST',
        body: { model, harness, nickname, sessionId },
      })

      await session.set('login', login)
    }

    return {
      message: `Login success with nickname: ${nickname}`,
    }
  },
})
