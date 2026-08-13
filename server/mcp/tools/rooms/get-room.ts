import type { TwentyFourState } from '#shared/24-point'
import type { Room } from '#shared/rooms'
import { renderTwentyFourChallenge } from '#shared/24-point'
import { getGameName } from '#shared/games'
import { z } from 'zod'
import { resolveAgentFromToken } from '../../../utils/agent'
import { withTokenEcho } from '../../utils/identity'
import { getRoomUrl } from '../../utils/room-url'
import { renderRoomBoard, toMcpGameResult, toMcpRoomSummary } from '../../utils/room-view'

function stateMessage(room: Room, userId?: string): string {
  const game = getGameName(room.gameId)
  if (room.status === 'waiting')
    return `Room ${room.id} (${game}): waiting for players (${room.players.length}/${room.maxPlayers}).`
  if (room.status === 'playing') {
    return room.gameId === '24-point' && room.game
      ? `Room ${room.id} (${game}): ${renderTwentyFourChallenge(room.game.state as TwentyFourState, userId)}.`
      : `Room ${room.id} (${game}): move #${room.game?.moveCount ?? 0}.`
  }
  if (room.status === 'aborted')
    return `Room ${room.id} (${game}): match aborted.`
  const winnerNickname = room.winner
    ? room.players.find(player => player.sessionId === room.winner)?.nickname
    : undefined
  return winnerNickname
    ? `Room ${room.id} (${game}): match ended, ${winnerNickname} won.`
    : `Room ${room.id} (${game}): match ended in a draw.`
}

export default defineMcpTool({
  group: 'rooms',
  name: 'get-room',
  description: 'Fetch the latest state of any room by room id without blocking. Stateless: no auth is required and the room does not have to be one you participate in. Returns a compact room summary plus the current board/challenge; when the optional token belongs to a player it returns the same identity-aware game payload as the move tools (yourSide, currentPlayer, moveNumber, lastMove, board/challenge).',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    roomId: z.string().min(1).describe('Room id, e.g. r-a1b2c3'),
    token: z.string().optional().describe('Optional login token; when provided it is verified and echoed back in the response'),
  },
  inputExamples: [
    { roomId: 'r-a1b2c3' },
  ],
  handler: async ({ roomId, token }) => {
    let userId: string | undefined
    if (typeof token === 'string' && token.trim()) {
      const agent = await resolveAgentFromToken(token)
      userId = agent.sessionId
    }
    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)
    const isPlayer = userId !== undefined && room.players.some(player => player.sessionId === userId)
    const game = isPlayer && userId ? toMcpGameResult(room, userId) : undefined
    const result: Record<string, unknown> = {
      message: stateMessage(room, isPlayer ? userId : undefined),
      roomId: room.id,
      room: toMcpRoomSummary(room),
      roomUrl: getRoomUrl(room.id),
      ...(game ? { game } : {}),
    }
    if (!game) {
      const board = renderRoomBoard(room)
      if (board)
        result.board = board
      if (room.gameId === '24-point' && room.game)
        result.challenge = renderTwentyFourChallenge(room.game.state as TwentyFourState)
    }
    return typeof token === 'string' && token.trim()
      ? withTokenEcho(result, token)
      : result
  },
})
