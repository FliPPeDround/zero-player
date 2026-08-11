import type { Room } from '#shared/rooms'
import { GAME_IDS } from '#shared/games'
import { z } from 'zod'
import { createRoomWaiter, describeRoomOutcome } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomResult } from '../../utils/room-view'
import { DEFAULT_WAIT_TIMEOUT_SECONDS, waitTimeoutMessage } from '../../utils/wait-message'

function createdMessage(room: Room, userId: string): string {
  if (room.status === 'playing') {
    const joined = room.players.find(player => player.sessionId !== userId)
    const turn = room.game?.currentPlayerId === userId ? 'it is your turn' : 'waiting for your turn'
    return `Game started — ${joined?.nickname ?? 'another player'} joined; ${turn}.`
  }
  return describeRoomOutcome(room, userId)
}

export default defineMcpTool({
  group: 'rooms',
  description: 'Create a new room. The calling agent is added as the first player; the game starts automatically when the room is full. The call blocks until another player joins and the game starts (or the match ends), then returns the latest room state. On timeout it returns the current room state with a message asking whether to keep waiting or exit.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    name: z.string().trim().min(1).max(60).optional().describe('Human-friendly room name, defaults to "<nickname>\'s room"'),
    game: z.enum(GAME_IDS).describe('Game to play; choose from the known platform catalog'),
    token: z.string().optional().describe('Your login token from login; required for every stateful call'),
    timeoutSeconds: z.number().int().min(5).max(300).optional().describe('How long to wait for another player to join before returning (default 60)'),
  },
  inputExamples: [
    { game: 'gomoku', token: '<token from login>' },
    { game: 'gomoku', name: 'Friday Night Brawl', token: '<token from login>' },
  ],
  handler: async ({ name, game, token, timeoutSeconds }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const timeoutMs = (timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS) * 1000
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)

    const room = await $fetch('/api/rooms', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenValue}` },
      body: { name, gameId: game },
    })

    const isDone = (candidate: Room) => candidate.status === 'playing' || candidate.status === 'finished' || candidate.status === 'aborted'

    // The room id is only known after creation, so subscribe right after the
    // POST; the re-read below closes the tiny gap in which a fast joiner
    // could act before the listener existed.
    const waiter = createRoomWaiter(room.id, isDone, timeoutMs)
    try {
      const latest = await $fetch<Room>(`/api/rooms/${encodeURIComponent(room.id)}`)
      if (isDone(latest)) {
        waiter.cancel()
        return echo({ message: createdMessage(latest, userId), ...toMcpRoomResult(latest) })
      }

      const outcome = await waiter.wait()
      const finalRoom = outcome.room ?? latest
      if (outcome.closed)
        return echo({ message: 'Room was closed.', ...toMcpRoomResult(finalRoom) })
      if (outcome.timedOut) {
        return echo({
          message: waitTimeoutMessage({
            waitedSeconds: timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS,
            waitedFor: 'another player to join',
            continueHint: `call make-${game}-move to keep waiting for the game to start`,
            exitHint: 'call leave-room to give up your seat',
          }),
          ...toMcpRoomResult(finalRoom),
        })
      }
      return echo({ message: createdMessage(finalRoom, userId), ...toMcpRoomResult(finalRoom) })
    }
    finally {
      waiter.cancel()
    }
  },
})
