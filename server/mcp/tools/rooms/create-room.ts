import type { Room } from '#shared/rooms'
import { GAME_IDS, getGameName } from '#shared/games'
import { z } from 'zod'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand } from '../../utils/room-url'
import { toMcpRoomSummary } from '../../utils/room-view'

function createdMessage(room: Room, roomUrl: string): string {
  return `
# Room Created Successfully

**Room ID**: ${room.id} (${getGameName(room.gameId)})  
**Status**: Waiting for another player.  
**Watch Link**: ${roomUrl} (share with human spectators)

## Required Actions

1. **Execute the returned \`watchCommand\`** immediately and keep it streaming in the background.  
   - This stream pushes room status updates, action hints, and will output the exact signal \`Call start-game now\` when the room becomes full.

2. **Do not call \`start-game\`** until you receive the signal \`Call start-game now\` from the stream.

3. **Keep the stream running** until the game ends (either normally or due to an error).

## Fallback: Polling with \`get-room\`

If the \`watchCommand\` stream disconnects, fails to start, or stops sending updates, you may **fall back to polling** the room state using the \`get-room\` tool at reasonable intervals.  

- Use polling only when the stream is unavailable or unresponsive.  
- Polling can confirm when the room becomes full (e.g., \`playerCount == 2\`) and retrieve current status.  
- Once the stream recovers, prefer it over polling to reduce load.

## Important Notes

- Only call \`start-game\` after receiving the signal **either** from the stream (preferred) or from polling confirmation that the room is full.  
- You are allowed to restart \`watchCommand\` if needed, but avoid running multiple concurrent watchers unnecessarily.  
- Continue monitoring (via stream or polling) until the game concludes.  
`
}

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a new room. The calling agent is added as the first player; the room stays waiting, and once it is full every player must call start-game to mark themselves ready — the game starts only once all players have called it. Returns immediately with the room id, a compact room summary (id, name, gameId, status, playerCount, maxPlayers) and a watchCommand that streams live updates for the whole match until the game ends.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('room name, defaults to "<nickname>\'s room"'),
    game: z.enum(GAME_IDS).describe('Game to play; choose from the known platform catalog'),
    token: z.string().describe('Your login token from login; required for every stateful call'),
  },
  inputExamples: [
    { game: 'gomoku', token: '<token from login>' },
    { game: 'gomoku', name: 'Friday Night Brawl', token: '<token from login>' },
  ],
  handler: async ({ name, game, token }) => {
    await requireAgentFromToken(token)
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)

    const room = await $fetch<Room>('/api/rooms', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenValue}` },
      body: { name, gameId: game },
    })

    const watchCommand = getWatchCommand(room.id, tokenValue)
    const roomUrl = getRoomUrl(room.id)
    return echo({
      message: createdMessage(room, roomUrl),
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl,
      watchCommand,
    })
  },
})
