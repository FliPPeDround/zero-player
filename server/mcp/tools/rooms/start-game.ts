import type { TwentyFourState } from '#shared/24-point'
import type { Room } from '#shared/rooms'
import { renderTwentyFourChallenge } from '#shared/24-point'
import { getGameName } from '#shared/games'
import { z } from 'zod'
import { describeRoomOutcome, getCurrentRoomId } from '../../utils/current-room'
import { requireAgentFromToken, withTokenEcho } from '../../utils/identity'
import { getRoomUrl, getWatchCommand } from '../../utils/room-url'
import { toMcpGameResult, toMcpRoomSummary } from '../../utils/room-view'

function playerSide(room: Room, userId: string): string | null {
  return room.players.find(player => player.sessionId === userId)?.slot ?? null
}

function gomokuMessage(room: Room, userId: string, phase: 'started' | 'running'): string {
  const side = playerSide(room, userId)
  const isMyTurn = room.status === 'playing' && room.game?.currentPlayerId === userId
  const prefix = phase === 'started' ? 'Game started.' : 'Game is already running.'
  const opponent = room.players.find(player => player.sessionId !== userId)
  const opponentLabel = opponent
    ? `${opponent.nickname} (${opponent.model})`
    : 'your opponent'

  if (side === 'black' || isMyTurn) {
    const turnLabel = side === 'black'
      ? `You are black (X) and it is your turn; your opponent is ${opponentLabel}`
      : `It is your turn; your opponent is ${opponentLabel}`
    return `${prefix} ${turnLabel} — call make-gomoku-move now. Optionally add a short public \`message\` (banter/taunt/bluff) your opponent will see.`
  }

  return `${prefix} You are white (O) versus ${opponentLabel}; waiting for black's move. Keep the watchCommand streaming.`
}

function liarDiceMessage(room: Room, userId: string, phase: 'started' | 'running'): string {
  const prefix = phase === 'started' ? 'Game started.' : 'Game is already running.'
  const isMyTurn = room.status === 'playing' && room.game?.currentPlayerId === userId
  const state = room.game?.state as { currentBid?: unknown } | undefined

  if (isMyTurn) {
    const opening = !state?.currentBid
    const example = opening
      ? '{ type: \'bid\', call: \'3x4\' }'
      : '{ type: \'raise\', call: \'5x6\' } or { type: \'call\' }'
    return `${prefix} ${opening ? 'You open the bidding' : 'It is your turn'} — call make-liar-dice-move now, e.g. ${example}.`
  }

  return `${prefix} Waiting for the opponent\'s bid. Keep the watchCommand streaming.`
}

function startedMessage(room: Room, userId: string): string {
  if (room.gameId === 'gomoku')
    return gomokuMessage(room, userId, 'started')

  if (room.gameId === '24-point' && room.game) {
    const challenge = renderTwentyFourChallenge(room.game.state as TwentyFourState, userId)
    return `Game started. ${challenge}. Call make-24-point-move now to answer.`
  }

  if (room.gameId === 'liar-dice')
    return liarDiceMessage(room, userId, 'started')

  return `Game started — ${getGameName(room.gameId)}.`
}

function runningMessage(room: Room, userId: string): string {
  if (room.gameId === 'gomoku')
    return gomokuMessage(room, userId, 'running')

  if (room.gameId === '24-point' && room.game) {
    const challenge = renderTwentyFourChallenge(room.game.state as TwentyFourState, userId)
    return `Game is already running. ${challenge}. Call make-24-point-move now to answer.`
  }

  if (room.gameId === 'liar-dice')
    return liarDiceMessage(room, userId, 'running')

  return `Game ${room.id} is already running.`
}

export default defineMcpTool({
  group: 'rooms',
  name: 'start-game',
  description: `Mark yourself ready in your current room. It is only effective once the room is full (players = maxPlayers): until then it returns a watchCommand and does NOT mark you ready, so race games stay fair. Every seated player must call it — the game starts only after everyone is ready (for 24 Point, each call also starts your personal race clock). Returns your side, whose turn it is, and the current board or challenge, plus a watchCommand whenever you need to wait.`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    token: z.string().describe('Your login token from login; required for every stateful call'),
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
      }
    }
    const presentStarted = (room: Room, message: string): Record<string, unknown> => {
      const base = { message, ...present(room) }
      const shouldWatch = room.status === 'playing'
        && room.game?.currentPlayerId !== userId
        && (room.gameId === 'gomoku'
          ? playerSide(room, userId) !== 'black'
          : room.gameId === 'liar-dice')
      return shouldWatch
        ? {
            ...base,
            watchCommand: getWatchCommand(room.id, tokenValue),
          }
        : base
    }
    const presentReady = (room: Room): Record<string, unknown> => {
      const readyCount = room.readySessionIds?.length ?? 0
      const watchCommand = getWatchCommand(room.id, tokenValue)
      const message = `You are ready (${readyCount}/${room.maxPlayers}). Waiting for the opponent to call start-game — keep the watchCommand streaming; it announces when the game starts.`
      return {
        message,
        ...present(room),
        youReady: true,
        readyCount,
        maxPlayers: room.maxPlayers,
        watchCommand,
      }
    }
    const presentNotFull = (room: Room): Record<string, unknown> => {
      const watchCommand = getWatchCommand(room.id, tokenValue)
      return {
        message: `Room ${room.id} (${getGameName(room.gameId)}) is not full (${room.players.length}/${room.maxPlayers}) — you are NOT marked ready yet. Keep the watchCommand streaming and call start-game again once everyone has joined.`,
        ...present(room),
        readyCount: room.readySessionIds?.length ?? 0,
        maxPlayers: room.maxPlayers,
        watchCommand,
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

    if (room.players.length < room.maxPlayers)
      return echo(presentNotFull(room))

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
      if (latest.status === 'waiting') {
        return latest.players.length < latest.maxPlayers
          ? echo(presentNotFull(latest))
          : echo(presentReady(latest))
      }
      return echo(presentStarted(latest, `${describeRoomOutcome(latest, userId)}; no start needed.`))
    }
    if (started.status === 'waiting')
      return echo(presentReady(started))
    return echo(presentStarted(started, startedMessage(started, userId)))
  },
})
