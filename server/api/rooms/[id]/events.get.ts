import type { TwentyFourState } from '#shared/24-point'
import type { Room, RoomEvent } from '#shared/rooms'
import { renderTwentyFourChallenge } from '#shared/24-point'
import { createEventStream, getHeader, getRouterParam } from 'h3'
import { describeRoomOutcome } from '../../../mcp/utils/current-room'
import { getRoomUrl } from '../../../mcp/utils/room-url'
import { renderRoomBoard, toMcpGameResult, toMcpRoomView } from '../../../mcp/utils/room-view'
import { resolveAgentFromToken } from '../../../utils/agent'
import { getRoom, onRoomDetail } from '../../../utils/room-store'

const POLL_INITIAL_INTERVAL_MS = 5000
const POLL_MEDIUM_INTERVAL_MS = 10_000
const POLL_MAX_INTERVAL_MS = 15_000
const POLL_FAST_WINDOW_MS = 30_000
const POLL_MEDIUM_WINDOW_MS = 90_000
const HEARTBEAT_INTERVAL_MS = 30_000

function isTerminal(room: Room): boolean {
  return room.status === 'finished' || room.status === 'aborted'
}

/**
 * Public SSE stream of one room's real-time state, consumed directly by the
 * `watchCommand` returned from the MCP tools (a plain `curl -N` against this
 * endpoint). It is a whole-match stream: it stays open from room creation
 * through the end of the game and pushes every state change as it happens,
 * instead of exiting at intermediate steps.
 *
 * While the room is waiting this stream stays compact: an initial snapshot
 * with the player count, `ready` (room full) and `youReady` (the watching
 * player already called `start-game`) flags, then `joined` / `left` / `ready`
 * events for each player change, including a "Call start-game now" message
 * when the room is full and the watching player is not ready yet. When the
 * game actually starts (both players ready) it emits a `gameStarted` payload
 * with the compact game state and keeps streaming.
 *
 * Once a game is running, token-authenticated watchers get the same compact
 * payload as the `make-<game>-move` tools (yourSide, currentPlayer,
 * moveNumber, lastMove / challenge, board) and an action hint whenever it is
 * their turn ("call make-<game>-move now"). Spectators without a token keep
 * the sanitized full room view (no opponent move reasons, no raw coordinate
 * board, no hidden hands). The stream closes only when the game ends
 * (finished/aborted), the room is closed, the watcher disconnects, or an
 * error occurs.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing room id' })

  let userId: string | undefined
  let tokenValue: string | undefined
  const authorization = getHeader(event, 'authorization')
  if (authorization?.startsWith('Bearer ')) {
    tokenValue = authorization.slice('Bearer '.length).trim()
    const agent = await resolveAgentFromToken(tokenValue)
    userId = agent.sessionId
  }

  const initial = await getRoom(id)
  if (!initial)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  const roomUrl = getRoomUrl(id)
  const stream = createEventStream(event)
  const sendPromise = stream.send()

  const presentFull = (type: 'snapshot' | 'update', room: Room): Record<string, unknown> => {
    const board = renderRoomBoard(room)
    const base: Record<string, unknown> = {
      type,
      room: toMcpRoomView(room),
      roomUrl,
      ...(board ? { board } : {}),
      ...(room.gameId === '24-point' && room.game
        ? { challenge: renderTwentyFourChallenge(room.game.state as TwentyFourState) }
        : {}),
    }
    if (userId && room.players.some(player => player.sessionId === userId))
      base.game = toMcpGameResult(room, userId)
    return base
  }

  const presentWaiting = (room: Room): Record<string, unknown> => {
    const full = room.players.length >= room.maxPlayers
    const readyCount = room.readySessionIds?.length ?? 0
    const youReady = !!userId && readySessionIds(room).includes(userId)
    return {
      type: 'snapshot',
      roomId: room.id,
      status: room.status,
      players: room.players.length,
      maxPlayers: room.maxPlayers,
      ready: full,
      readyCount,
      youReady,
      ...(full && !youReady
        ? { message: `Room is full (${room.players.length}/${room.maxPlayers}). Call start-game now to mark yourself ready.` }
        : full
          ? { message: `You are ready (${readyCount}/${room.maxPlayers}). Waiting for the opponent to call start-game.` }
          : { message: `Waiting for players (${room.players.length}/${room.maxPlayers}); call start-game once the room is full.` }),
    }
  }

  const waitingEvent = (room: Room, event: RoomEvent, type: 'joined' | 'left'): Record<string, unknown> => {
    const full = room.players.length >= room.maxPlayers
    const readyCount = room.readySessionIds?.length ?? 0
    const youReady = !!userId && readySessionIds(room).includes(userId)
    return {
      type,
      username: event.actor ?? 'unknown',
      players: room.players.length,
      maxPlayers: room.maxPlayers,
      ready: full,
      readyCount,
      youReady,
      ...(type === 'joined' && full && !youReady
        ? { message: `Room is full (${room.players.length}/${room.maxPlayers}). Call start-game now to mark yourself ready.` }
        : {}),
    }
  }

  /** Same compact game payload as the make-<game>-move tools, plus a message and token echo. */
  const presentGame = (room: Room, userIdValue: string, token: string, message: string): Record<string, unknown> => ({
    token,
    message,
    ...toMcpGameResult(room, userIdValue),
  })

  const gameStatusMessage = (room: Room, userIdValue: string): string => {
    const result = toMcpGameResult(room, userIdValue)
    const opponentLabel = result.opponent
      ? `${result.opponent.nickname} (${result.opponent.model})`
      : 'the opponent'
    if (isTerminal(room))
      return describeRoomOutcome(room, userIdValue)
    if (room.status === 'playing' && room.game?.currentPlayerId === userIdValue) {
      if (room.gameId === 'gomoku') {
        if (!result.lastMove)
          return 'It is your turn — call make-gomoku-move now.'
        const said = result.opponentLastMessage
          ? ` and said: "${result.opponentLastMessage}"`
          : ''
        return `Opponent ${opponentLabel} moved at ${result.lastMove}${said}. It is your turn — call make-gomoku-move now.`
      }
      return `It is your turn — call make-${room.gameId}-move now.`
    }
    if (room.gameId === 'gomoku')
      return 'Waiting for the opponent\'s move.'
    if (room.gameId === '24-point')
      return 'Game is running. Call make-24-point-move now to answer.'
    if (room.gameId === 'liar-dice')
      return 'Waiting for the opponent\'s bid.'
    return 'Game is running.'
  }

  function readySessionIds(room: Room): string[] {
    return room.readySessionIds ?? []
  }

  let stopped = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let unsubscribe: () => void = () => {}
  const startedAt = Date.now()
  let lastKey = `${initial.updatedAt}|${initial.events.length}`
  let lastEventCount = initial.events.length
  let lastStatus = initial.status

  const stop = (): void => {
    if (stopped)
      return
    stopped = true
    if (pollTimer)
      clearTimeout(pollTimer)
    if (heartbeatTimer)
      clearInterval(heartbeatTimer)
    unsubscribe()
    void stream.close()
  }

  const sendJson = (data: unknown): Promise<void> =>
    stream.push(JSON.stringify(data)).catch(() => {})

  /** Emits compact player/readiness events while waiting. Never closes the stream. */
  const emitWaitingEvents = (room: Room, events: RoomEvent[]): void => {
    for (const event of events) {
      if (event.type === 'player_joined') {
        const payload = waitingEvent(room, event, 'joined')
        void sendJson(payload)
      }
      else if (event.type === 'player_left') {
        void sendJson(waitingEvent(room, event, 'left'))
      }
      else if (event.type === 'player_ready') {
        const readyCount = room.readySessionIds?.length ?? 0
        void sendJson({
          type: 'ready',
          username: event.actor ?? 'unknown',
          players: room.players.length,
          maxPlayers: room.maxPlayers,
          ready: room.players.length >= room.maxPlayers,
          readyCount,
          youReady: !!userId && readySessionIds(room).includes(userId),
          message: `${readyCount}/${room.maxPlayers} ready — the game starts when both players have called start-game.`,
        })
      }
    }
  }

  /** Payload sent when the game just started; the stream stays open. */
  const presentGameStarted = (room: Room, type: 'snapshot' | 'update'): void => {
    if (userId && tokenValue) {
      void sendJson({
        ...presentGame(room, userId, tokenValue, gameStatusMessage(room, userId)),
        gameStarted: true,
      })
      return
    }
    void sendJson({ ...presentFull(type, room), gameStarted: true })
  }

  unsubscribe = onRoomDetail(id, (message) => {
    if (stopped)
      return
    if (message.type === 'error') {
      void sendJson({ type: 'error', message: message.message }).then(stop)
      return
    }
    if (message.type === 'closed') {
      void sendJson({ type: 'closed', roomId: id, message: 'Room closed.' }).then(stop)
      return
    }
    if (!('room' in message)) {
      void sendJson({ type: 'closed', roomId: id, message: 'Room closed.' }).then(stop)
      return
    }

    const room = message.room
    const prevStatus = lastStatus
    lastStatus = room.status
    lastKey = `${room.updatedAt}|${room.events.length}`
    const newEvents = room.events.slice(lastEventCount)
    lastEventCount = room.events.length

    if (room.status === 'waiting') {
      emitWaitingEvents(room, newEvents)
      return
    }

    if (prevStatus === 'waiting') {
      presentGameStarted(room, message.type === 'snapshot' ? 'snapshot' : 'update')
      return
    }

    if (userId && tokenValue) {
      const pushed = sendJson(presentGame(room, userId, tokenValue, gameStatusMessage(room, userId)))
      if (isTerminal(room))
        void pushed.then(stop)
      return
    }

    const pushed = sendJson(presentFull(message.type === 'snapshot' ? 'snapshot' : 'update', room))
    if (isTerminal(room))
      void pushed.then(stop)
  })

  const schedulePoll = (elapsedMs: number): void => {
    if (stopped)
      return
    const delayMs = elapsedMs < POLL_FAST_WINDOW_MS
      ? POLL_INITIAL_INTERVAL_MS
      : elapsedMs < POLL_MEDIUM_WINDOW_MS
        ? POLL_MEDIUM_INTERVAL_MS
        : POLL_MAX_INTERVAL_MS
    pollTimer = setTimeout(() => {
      void (async () => {
        if (stopped)
          return
        const room = await getRoom(id)
        if (stopped)
          return
        if (!room) {
          await sendJson({ type: 'closed', roomId: id, message: 'Room closed.' })
          stop()
          return
        }
        const prevStatus = lastStatus
        lastStatus = room.status
        const key = `${room.updatedAt}|${room.events.length}`
        if (key !== lastKey) {
          lastKey = key
          const newEvents = room.events.slice(lastEventCount)
          lastEventCount = room.events.length
          if (room.status === 'waiting') {
            emitWaitingEvents(room, newEvents)
            schedulePoll(Date.now() - startedAt)
            return
          }
          if (prevStatus === 'waiting') {
            presentGameStarted(room, 'update')
            return
          }
          if (userId && tokenValue) {
            await sendJson(presentGame(room, userId, tokenValue, gameStatusMessage(room, userId)))
            if (isTerminal(room)) {
              stop()
              return
            }
            schedulePoll(Date.now() - startedAt)
            return
          }
          await sendJson(presentFull('update', room))
          if (isTerminal(room)) {
            stop()
            return
          }
        }
        schedulePoll(Date.now() - startedAt)
      })().catch((error) => {
        console.error('[rooms] SSE poll failed:', error)
        stop()
      })
    }, delayMs)
  }

  heartbeatTimer = setInterval(() => {
    if (!stopped)
      void stream.push({ event: 'ping', data: '' }).catch(() => {})
  }, HEARTBEAT_INTERVAL_MS)

  stream.onClosed(() => {
    stopped = true
    if (pollTimer)
      clearTimeout(pollTimer)
    if (heartbeatTimer)
      clearInterval(heartbeatTimer)
    unsubscribe()
  })

  if (stopped) {
    void sendPromise
    return
  }

  if (initial.status === 'waiting') {
    const snapshot = presentWaiting(initial)
    void sendJson(snapshot)
    schedulePoll(0)
  }
  else {
    if (userId && tokenValue) {
      void sendJson(presentGame(initial, userId, tokenValue, gameStatusMessage(initial, userId)))
      if (isTerminal(initial))
        stop()
      else
        schedulePoll(0)
    }
    else {
      void sendJson(presentFull('snapshot', initial))
      if (isTerminal(initial))
        stop()
      else
        schedulePoll(0)
    }
  }

  void sendPromise
})
