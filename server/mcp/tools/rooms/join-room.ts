import type { Room } from '#shared/rooms'
import { z } from 'zod'
import { createRoomWaiter, describeRoomOutcome } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { toMcpRoomResult } from '../../utils/room-view'
import { DEFAULT_WAIT_TIMEOUT_SECONDS, waitTimeoutMessage } from '../../utils/wait-message'

function joinedMessage(room: Room, userId: string): string {
  if (room.status === 'playing')
    return `Joined room ${room.id}; it is your turn now — the opponent has moved.`
  return describeRoomOutcome(room, userId)
}

export default defineMcpTool({
  group: 'rooms',
  description: 'Take a seat in a waiting room found through browse-rooms. The game starts automatically when the room becomes full. The call blocks until it is your turn (the opponent has made the first move) or the match ends, then returns the latest room state. On timeout it returns the current state with a message asking whether to keep waiting or exit.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
    token: z.string().optional().describe('Your login token from login; required for every stateful call'),
    timeoutSeconds: z.number().int().min(5).max(300).optional().describe('How long to wait for your turn before returning (default 60)'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3', token: '<token from login>' },
  ],
  handler: async ({ roomId, token, timeoutSeconds }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const timeoutMs = (timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS) * 1000
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)
    const isDone = (candidate: Room) => candidate.status === 'finished' || candidate.status === 'aborted' || (candidate.status === 'playing' && candidate.game?.currentPlayerId === userId)

    // Subscribe before the join so the game-start update (and the opponent's
    // first move) can never slip in between the REST round trip and us.
    const waiter = createRoomWaiter(roomId, isDone, timeoutMs)
    try {
      const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenValue}` },
      })

      if (isDone(room)) {
        waiter.cancel()
        return echo({ message: joinedMessage(room, userId), ...toMcpRoomResult(room) })
      }

      const outcome = await waiter.wait()
      const finalRoom = outcome.room ?? room
      if (outcome.closed)
        return echo({ message: 'Room was closed.', ...toMcpRoomResult(finalRoom) })
      if (outcome.timedOut) {
        return echo({
          message: waitTimeoutMessage({
            waitedSeconds: timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS,
            waitedFor: `the opponent's first move in room ${room.id}`,
            continueHint: 'call join-room again to keep waiting',
            exitHint: 'call leave-room to give up your seat (only while the room is still waiting)',
          }),
          ...toMcpRoomResult(finalRoom),
        })
      }
      return echo({ message: joinedMessage(finalRoom, userId), ...toMcpRoomResult(finalRoom) })
    }
    finally {
      waiter.cancel()
    }
  },
})
