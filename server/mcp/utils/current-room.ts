import type { Room } from '#shared/rooms'
import type { RoomDetailMessage } from '../../utils/room-store'
import { findActiveRoomForSession, onRoomDetail } from '../../utils/room-store'

/**
 * Adaptive REST poll fallback: fast at first, then backs off so long waits
 * stay cheap while turns are still detected quickly.
 */
const POLL_INITIAL_INTERVAL_MS = 1000
const POLL_FAST_WINDOW_MS = 10_000
const POLL_MEDIUM_INTERVAL_MS = 2000
const POLL_MEDIUM_WINDOW_MS = 30_000
const POLL_SLOW_INTERVAL_MS = 3000
const POLL_SLOW_WINDOW_MS = 60_000
const POLL_MAX_INTERVAL_MS = 5000

function pollDelayMs(elapsedMs: number): number {
  if (elapsedMs < POLL_FAST_WINDOW_MS)
    return POLL_INITIAL_INTERVAL_MS
  if (elapsedMs < POLL_MEDIUM_WINDOW_MS)
    return POLL_MEDIUM_INTERVAL_MS
  if (elapsedMs < POLL_SLOW_WINDOW_MS)
    return POLL_SLOW_INTERVAL_MS
  return POLL_MAX_INTERVAL_MS
}

/**
 * MCP-side session resolver. REST stays decoupled from session membership:
 * MCP tools use this helper to map the current MCP session to the room id,
 * then call the standard `/api/rooms/:id/*` endpoints with that id.
 */
export async function getCurrentRoomId(sessionId: string): Promise<string> {
  const room = await findActiveRoomForSession(sessionId)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'You are not in any active room' })
  return room.id
}

/**
 * Read-only subscription to the room detail feed — the same in-process event
 * source the WebSocket layer (`/ws/rooms/:id`) forwards to browsers. MCP tools
 * use it to block until the room state they care about has arrived. On
 * Cloudflare the event source is per-isolate, so the waiter below also polls
 * REST as a cross-isolate fallback. Returns an unsubscribe function.
 */
export function subscribeToRoom(roomId: string, listener: (message: RoomDetailMessage) => void): () => void {
  return onRoomDetail(roomId, listener)
}

export interface RoomWaitOutcome {
  /**
   * Latest room received from the update feed. Null only when the wait timed
   * out before any event arrived; callers fall back to their REST baseline.
   */
  room: Room | null
  timedOut: boolean
  /** True when the room was closed (deleted) while waiting. */
  closed: boolean
}

export interface RoomWaiter {
  /** Resolves when `predicate` is met, the room is closed, or the timeout elapses. */
  wait: () => Promise<RoomWaitOutcome>
  /** Stop listening and clear the timer. Idempotent; safe to call after resolution. */
  cancel: () => void
}

/**
 * Block on the room update feed until `predicate` is satisfied, the room is
 * closed, or `timeoutMs` elapses. The in-process feed wakes the waiter in the
 * common case; a REST poll fallback covers requests that run in a different
 * Worker isolate than the request that wrote the update. Every exit path
 * unsubscribes and clears the timers, so a waiter never leaks.
 */
export function createRoomWaiter(
  roomId: string,
  predicate: (room: Room) => boolean,
  timeoutMs: number,
): RoomWaiter {
  let latest: Room | null = null
  let outcome: RoomWaitOutcome | undefined
  let resolveWait: ((value: RoomWaitOutcome) => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let startedAt = 0
  let polling = false
  let notFoundStreak = 0
  let waitPromise: Promise<RoomWaitOutcome> | undefined
  let unsubscribe: () => void = () => {}

  const settle = (next: RoomWaitOutcome): void => {
    if (outcome)
      return
    outcome = next
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = undefined
    }
    unsubscribe()
    resolveWait?.(next)
  }

  const checkRoom = async (): Promise<void> => {
    if (outcome || polling)
      return
    polling = true
    try {
      const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)
      latest = room
      notFoundStreak = 0
      if (predicate(room))
        settle({ room, timedOut: false, closed: false })
    }
    catch (error) {
      const status = typeof error === 'object' && error !== null
        ? (error as { statusCode?: number }).statusCode
        ?? (error as { response?: { status?: number } }).response?.status
        : undefined
      if (status === 404) {
        if (latest) {
          settle({ room: latest, timedOut: false, closed: true })
        }
        else {
          notFoundStreak += 1
          if (notFoundStreak >= 3)
            settle({ room: null, timedOut: false, closed: true })
        }
      }
    }
    finally {
      polling = false
    }
  }

  const scheduleNextPoll = (): void => {
    if (outcome)
      return
    const delayMs = pollDelayMs(Date.now() - startedAt)
    pollTimer = setTimeout(() => {
      void checkRoom()
        .catch((error) => {
          console.error('[rooms] waiter poll failed:', error)
        })
        .finally(scheduleNextPoll)
    }, delayMs)
  }

  unsubscribe = subscribeToRoom(roomId, (message) => {
    if (message.type === 'error' || !('room' in message))
      return
    latest = message.room
    if (message.type === 'closed' || predicate(message.room))
      settle({ room: message.room, timedOut: false, closed: message.type === 'closed' })
  })

  timer = setTimeout(() => {
    settle({ room: latest, timedOut: true, closed: false })
  }, timeoutMs)
  startedAt = Date.now()
  scheduleNextPoll()

  return {
    wait(): Promise<RoomWaitOutcome> {
      waitPromise ??= new Promise<RoomWaitOutcome>((resolve) => {
        resolveWait = resolve
        if (outcome)
          resolve(outcome)
      })
      return waitPromise
    },
    cancel(): void {
      settle({ room: latest, timedOut: true, closed: false })
    },
  }
}

/**
 * Human summary of a terminal room, e.g. "Match ended: you won".
 */
export function describeRoomOutcome(room: Room, userId: string): string {
  if (room.status === 'aborted')
    return 'Match aborted'
  const myNickname = room.players.find(player => player.sessionId === userId)?.nickname
  if (room.winner && room.winner === myNickname)
    return 'Match ended: you won'
  if (room.winner)
    return `Match ended: ${room.winner} won`
  return 'Match ended: draw'
}
