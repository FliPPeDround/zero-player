import type { TwentyFourState } from '#shared/24-point'
import type { Room } from '#shared/rooms'
import { renderTwentyFourChallenge } from '#shared/24-point'
import { getGameName } from '#shared/games'
import { z } from 'zod'
import { describeRoomOutcome, getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand, getWindowsWatchCommand } from '../../utils/room-url'
import { toMcpGameResult, toMcpRoomSummary } from '../../utils/room-view'

function playerSide(room: Room, userId: string): string | null {
  return room.players.find(player => player.sessionId === userId)?.slot ?? null
}

function gomokuMessage(room: Room, userId: string, phase: 'started' | 'running'): string {
  const side = playerSide(room, userId)
  const isMyTurn = room.status === 'playing' && room.game?.currentPlayerId === userId
  const prefix = phase === 'started' ? 'Game started.' : 'Game is already running.'

  if (side === 'black' || isMyTurn) {
    const turnLabel = side === 'black'
      ? 'You are black (X) and it is your turn'
      : 'It is your turn'
    return `${prefix} ${turnLabel} — call make-gomoku-move now.`
  }

  return `${prefix} You are white (O); waiting for black's move. Run the returned watchCommand (Windows: watchCommandWindows), then call make-gomoku-move when it is your turn.`
}

function startedMessage(room: Room, userId: string): string {
  if (room.gameId === 'gomoku')
    return gomokuMessage(room, userId, 'started')

  if (room.gameId === '24-point' && room.game) {
    const challenge = renderTwentyFourChallenge(room.game.state as TwentyFourState, userId)
    return `Game started. ${challenge}. Call make-24-point-move now to answer.`
  }

  return `Game started — ${getGameName(room.gameId)}.`
}

function runningMessage(room: Room, userId: string): string {
  if (room.gameId === 'gomoku')
    return gomokuMessage(room, userId, 'running')

  if (room.gameId === '24-point' && room.game) {
    const challenge = renderTwentyFourChallenge(room.game.state as TwentyFourState, userId)
    return `Game is already running. ${challenge}. Call make-24-point-move now to answer.`
  }

  return `Game ${room.id} is already running.`
}

export default defineMcpTool({
  group: 'rooms',
  name: 'start-game',
  description: 'Start the game in your current room once it is full. Any player in the room can start; it is the mandatory pre-game step for every game. Returns immediately with a compact room summary (id, name, gameId, status, playerCount, maxPlayers) plus game-specific state: Gomoku black gets the board and is told to call make-gomoku-move, Gomoku white gets watchCommand/watchCommandWindows to wait for its turn, and 24 Point gets the first question and is told to call make-24-point-move. If the room is not full it also returns a watchCommand.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().optional().describe('Your login token from login; required for every stateful call'),
  },
  inputExamples: [
    { token: '<token from login>' },
  ],
  handler: async ({ token }) => {
    const agent = await requireAgentFromToken(token)
    const userId = agent.sessionId
    const tokenValue = String(token)
    const echo = (result: Record<string, unknown>) => withTokenEcho(result, tokenValue)
    const present = (room: Room) => {
      const game = toMcpGameResult(room, userId)
      return {
        roomId: room.id,
        room: toMcpRoomSummary(room),
        roomUrl: getRoomUrl(room.id),
        game,
        ...(room.gameId === '24-point' && game.challenge ? { challenge: game.challenge } : {}),
      }
    }
    const presentStarted = (room: Room, message: string): Record<string, unknown> => {
      const base = { message, ...present(room) }
      const shouldWatch = room.status === 'playing'
        && room.gameId === 'gomoku'
        && playerSide(room, userId) !== 'black'
        && room.game?.currentPlayerId !== userId
      return shouldWatch
        ? {
            ...base,
            watchCommand: getWatchCommand(room.id, tokenValue),
            watchCommandWindows: getWindowsWatchCommand(room.id, tokenValue),
          }
        : base
    }
    const presentNotFull = (room: Room): Record<string, unknown> => {
      const watchCommand = getWatchCommand(room.id, tokenValue)
      const watchCommandWindows = getWindowsWatchCommand(room.id, tokenValue)
      return {
        message: `Room ${room.id} (${getGameName(room.gameId)}) is not full yet (${room.players.length}/${room.maxPlayers}). You MUST run the returned watchCommand (Windows: watchCommandWindows) to monitor the room status until it is full; do not call start-game before watchCommand reports the room is full.`,
        ...present(room),
        watchCommand,
        watchCommandWindows,
      }
    }

    const roomId = await getCurrentRoomId(userId)
    const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)

    if (room.status === 'playing' || room.status === 'finished' || room.status === 'aborted') {
      const message = room.status === 'playing'
        ? runningMessage(room, userId)
        : `${describeRoomOutcome(room, userId)}; no start needed.`
      return echo(presentStarted(room, message))
    }

    if (room.players.length < room.maxPlayers) {
      return echo(presentNotFull(room))
    }

    let started: Room
    try {
      started = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/start`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenValue}` },
      })
    }
    catch (error) {
      const status = typeof error === 'object' && error !== null
        ? (error as { statusCode?: number }).statusCode
        ?? (error as { response?: { status?: number } }).response?.status
        : undefined
      if (status !== 409)
        throw error
      // Another player started the room between our read and the POST.
      const latest = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)
      if (latest.status === 'playing')
        return echo(presentStarted(latest, runningMessage(latest, userId)))
      if (latest.status === 'waiting')
        return echo(presentNotFull(latest))
      return echo(presentStarted(latest, `${describeRoomOutcome(latest, userId)}; no start needed.`))
    }
    return echo(presentStarted(started, startedMessage(started, userId)))
  },
})
