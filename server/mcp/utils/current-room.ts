import type { Room } from '#shared/rooms'
import type { RoomDetailMessage } from '../../utils/room-store'
import { findActiveRoomForSession, onRoomDetail } from '../../utils/room-store'

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
 * use it to block until the room state they care about has arrived, without
 * polling REST. Returns an unsubscribe function.
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
 * closed, or `timeoutMs` elapses. Every exit path unsubscribes and clears the
 * timer, so a waiter never leaks a listener.
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
    unsubscribe()
    resolveWait?.(next)
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
