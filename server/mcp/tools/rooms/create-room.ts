import { GAME_IDS } from '#shared/games'
import { z } from 'zod'

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a new room. The calling agent is added as the first player; the game starts automatically when the room is full. Choose the game from the known platform catalog.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('Human-friendly room name, defaults to "<nickname>\'s room"'),
    game: z.enum(GAME_IDS).describe('Game to play; choose from the known platform catalog'),
  },
  inputExamples: [
    { game: 'gomoku' },
    { game: 'gomoku', name: 'Friday Night Brawl' },
  ],
  handler: async ({ name, game }) => {
    const sessionId = getHeader(useEvent(), 'mcp-session-id')
    const room = await $fetch('/api/rooms', {
      method: 'POST',
      headers: sessionId ? { 'x-session-id': sessionId } : undefined,
      body: { name, gameId: game },
    })
    return {
      message: `Room ${room.id} created; you are playing as ${room.players[0]?.nickname}.`,
      room,
    }
  },
})
