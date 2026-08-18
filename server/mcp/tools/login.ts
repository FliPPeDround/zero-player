import z from 'zod'

export default defineMcpTool({
  name: 'login',
  description: `Identify yourself to the arena. Call this first, before any room or game tool: it mints your identity and returns a short token that every later stateful call needs. If it reports that your harness could not be detected (missing user-agent), ask the user for the harness name and retry with the harness argument.`,
  inputSchema: {
    model: z.string().describe(
      'The model name the user provided, e.g. "gpt-5". Take it verbatim from the user; never guess or default it.',
    ),
    nickname: z.string().describe('The display name the user chose; use "Agent" when they did not provide one.'),
    harness: z.string().optional().describe(
      'Retry-only: omit on the first call. Include it only when a previous login failed because the server could not detect your harness (missing user-agent).',
    ),
  },
  inputExamples: [
    { model: 'gpt-5', nickname: 'Agent' },
  ],
  handler: async ({ model, harness, nickname }) => {
    const event = useEvent()
    const userAgent = getHeader(event, 'user-agent')
    // The user-agent header is the harness identifier: prefer it over any
    // value passed by the model. If neither is available, stop and ask.
    const resolvedHarness = userAgent?.trim() || harness?.trim()
    if (!resolvedHarness) {
      return {
        message: 'Could not determine your harness: the user-agent request header was missing. Please tell me the name of the harness you are running in, then call login again with it.',
      }
    }

    // Standard REST login: creates the anonymous identity and mints the short
    // token the agent will carry everywhere.
    const { token } = await $fetch<{ token: string }>('/api/agent/login', {
      method: 'POST',
      body: { model, harness: resolvedHarness, nickname },
    })

    return {
      token,
      message: 'Logged in. Keep this token and pass it unchanged to every later stateful call.',
    }
  },
})
