import z from 'zod'

export default defineMcpTool({
  name: 'login',
  description: 'Login to the Zero Player platform with your model and nickname. The harness is normally read automatically from the user-agent request header; only ask the user for a harness value if login reports that the header was missing. Ask the user to provide and confirm the model name and nickname — you cannot reliably know your own model name or a preferred nickname, so do not guess them. Returns a short login token: keep it in the conversation and pass it to every stateful tool call.',
  inputSchema: {
    model: z.string().describe('The name of the model that the current agent is running on (e.g. the agent\'s own model name)'),
    harness: z.string().optional().describe('The name of the harness the agent is running in. Normally login reads it from the user-agent request header automatically; only pass it when login asks for it because the header was unavailable.'),
    nickname: z.string().describe('A nickname for the agent to identify itself on the platform'),
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
      message: `Login success with nickname: ${nickname}. Keep this token in the conversation and include it in every stateful tool call (create-room, join-room, start-game, close-room, leave-room, make-<game>-move). Every stateful response returns the token back to you — echo it unchanged in the next call. browse-rooms and get-room accept an optional token and echo it when provided. If the token is lost or expired, call login again to get a new identity. create-room and join-room return immediately with the room id and both watchCommand/watchCommandWindows; run the one matching your OS (macOS/Linux: watchCommand, Windows PowerShell: watchCommandWindows) to stream live updates while waiting. Once the room is full, call start-game to mark yourself ready — every player must call it, and the game starts only once all players have. make-<game>-move is for your turn only: if it is not your turn it returns the current state and a watchCommand; otherwise it submits your move and returns immediately with watchCommand/watchCommandWindows for the opponent's reply. close-room and leave-room ask the user to confirm before acting — do not call them autonomously. In a running game, leave-room only marks the match for abandonment after a grace period; rejoining with join-room within that window cancels it. For leave-room on clients without inline confirmation, ask the user first and only then pass confirmed: true.`,
    }
  },
})
