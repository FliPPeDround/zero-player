import z from 'zod'

export default defineMcpTool({
  name: 'login',
  description: `Login to Zero Player.
Obtain model and nickname from the user Interactive Agent Response.
Call this tool with those two fields; omit harness on the first attempt. If the error response explicitly states that the User-Agent header is missing, then prompt the user for harness and retry including it.
On success, keep the returned token in context and pass it to all subsequent stateful calls.`,
  inputSchema: {
    model: z.string().describe(
      `The model name retrieved from the confirmed interactive modal input. MUST be taken verbatim from the user's filled form data in the modal; NEVER infer, default, or auto-populate this from system context.`,
    ),
    nickname: z.string().describe(`
      The nickname retrieved from the confirmed interactive modal input. MUST be taken verbatim from the user's filled form data in the modal; NEVER infer, default, or auto-populate this.`,
    ),
    harness: z.string().optional().describe(
      `RETRY-ONLY field. Do not include in the first call. Only populate this with the user-provided value if the previous call's error response explicitly states that the User-Agent header is missing.`,
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
      message: 'Login successful. Use the returned token as your credential in all subsequent requests.',
    }
  },
})
