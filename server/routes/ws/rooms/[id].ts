import type { Room, RoomDetailSocketMessage } from '#shared/rooms'
import type { Peer } from 'crossws'
import { getLatestRoomSnapshot, getRoom, onRoomDetail, setSpectatorCount } from '../../../utils/room-store'

const peersByRoom = new Map<string, Set<Peer>>()
const unsubscribers = new Map<string, () => void>()
const roomIdPattern = /^\/ws\/rooms\/([^/]+)$/
const SPECTATOR_DEBOUNCE_MS = 5000
const spectatorWrites = new Map<string, { count: number, lastWriteAt: number, timer?: ReturnType<typeof setTimeout> }>()

/**
 * The REST→Durable Object bridge (`broadcastToDurable` in room-store) delivers
 * room updates instantly, but it depends on cross-isolate plumbing (main
 * Worker → DO stub fetch) that can fail: stale deploys, transient DO errors,
 * cold starts. As a safety net, every room with connected peers is also
 * polled straight from KV on a short interval, so the board always catches up
 * even when the bridge is down. Bridge pushes update the poll key so the
 * fallback never replays a message it already delivered.
 */
const ROOM_POLL_INTERVAL_MS = 2000
interface RoomPoller {
  timer: ReturnType<typeof setInterval>
  lastKey: string
  lastRoom: Room
}
const pollers = new Map<string, RoomPoller>()

function roomPollKey(room: Room): string {
  return `${room.updatedAt}|${room.events.length}`
}

function stopRoomPoller(roomId: string): void {
  const poller = pollers.get(roomId)
  if (poller) {
    clearInterval(poller.timer)
    pollers.delete(roomId)
  }
}

function syncPollerKey(roomId: string, room: Room): void {
  const poller = pollers.get(roomId)
  if (poller) {
    poller.lastKey = roomPollKey(room)
    poller.lastRoom = room
  }
}

function ensureRoomPoller(roomId: string, initial: Room): void {
  if (pollers.has(roomId))
    return
  const poller: RoomPoller = {
    timer: setInterval(() => {
      void pollRoom(roomId)
    }, ROOM_POLL_INTERVAL_MS),
    lastKey: roomPollKey(initial),
    lastRoom: initial,
  }
  pollers.set(roomId, poller)
}

async function pollRoom(roomId: string): Promise<void> {
  const poller = pollers.get(roomId)
  const roomPeers = peersByRoom.get(roomId)
  if (!poller || !roomPeers || roomPeers.size === 0) {
    stopRoomPoller(roomId)
    return
  }
  const room = await getRoom(roomId)
  if (!room) {
    // Room was deleted (KV TTL / sweep / host close): notify peers and stop.
    const message: RoomDetailSocketMessage = { type: 'closed', room: poller.lastRoom }
    for (const connected of roomPeers)
      safeSend(connected, message)
    stopRoomPoller(roomId)
    return
  }
  const key = roomPollKey(room)
  if (key !== poller.lastKey) {
    poller.lastKey = key
    poller.lastRoom = room
    const message: RoomDetailSocketMessage = { type: 'update', room }
    for (const connected of roomPeers)
      safeSend(connected, message)
  }
}

function safeSend(peer: Peer, payload: unknown): void {
  try {
    peer.send(JSON.stringify(payload))
  }
  catch {
    // Peer can be closing/reset while we broadcast; nothing to do.
  }
}

function roomIdFromUrl(url: string): string | null {
  const pathname = new URL(url, 'http://localhost').pathname
  return pathname.match(roomIdPattern)?.[1] ?? null
}

async function writeSpectatorCount(roomId: string, count: number): Promise<void> {
  const normalized = Math.max(0, count)
  let state = spectatorWrites.get(roomId)
  if (!state) {
    state = { count: -1, lastWriteAt: 0 }
    spectatorWrites.set(roomId, state)
  }
  const current = state
  if (current.timer) {
    clearTimeout(current.timer)
    current.timer = undefined
  }
  current.count = normalized

  const flush = async (): Promise<void> => {
    current.timer = undefined
    current.lastWriteAt = Date.now()
    try {
      await setSpectatorCount(roomId, current.count)
    }
    catch (error) {
      console.error(`[rooms] failed to persist spectator count for ${roomId}:`, error)
    }
  }

  const now = Date.now()
  if (normalized === 0 || now - current.lastWriteAt >= SPECTATOR_DEBOUNCE_MS) {
    await flush()
    if (normalized === 0)
      spectatorWrites.delete(roomId)
    return
  }

  const remaining = SPECTATOR_DEBOUNCE_MS - (now - current.lastWriteAt)
  current.timer = setTimeout(() => {
    void flush()
  }, remaining)
}

export default defineWebSocketHandler({
  async open(peer) {
    const roomId = roomIdFromUrl(peer.request.url)
    if (!roomId) {
      // Do NOT close the socket: old clients with infinite auto-reconnect
      // would treat the close as a failure and reconnect forever. New clients
      // close themselves after seeing `room_not_found`.
      safeSend(peer, { type: 'error', code: 'room_not_found', message: 'Room not found' })
      return
    }
    const cached = getLatestRoomSnapshot(roomId)
    const stored = await getRoom(roomId)
    if (!cached && !stored) {
      // Same as above: keep the peer open so stale tabs stop hammering the
      // endpoint; newer clients stop themselves via `room_not_found`.
      safeSend(peer, { type: 'error', code: 'room_not_found', message: 'Room not found' })
      return
    }

    const roomPeers = peersByRoom.get(roomId) ?? new Set<Peer>()
    roomPeers.add(peer)
    peersByRoom.set(roomId, roomPeers)
    await writeSpectatorCount(roomId, roomPeers.size)

    if (!unsubscribers.has(roomId)) {
      unsubscribers.set(
        roomId,
        onRoomDetail(roomId, (message) => {
          if ('room' in message)
            syncPollerKey(roomId, message.room)
          for (const connected of peersByRoom.get(roomId) ?? [])
            safeSend(connected, message)
        }),
      )
    }

    const snapshot = cached && stored && cached.events.length > stored.events.length
      ? cached
      : (stored ?? cached)
    if (!snapshot)
      return
    safeSend(peer, { type: 'snapshot', room: snapshot })
    ensureRoomPoller(roomId, snapshot)
  },
  close(peer) {
    for (const [roomId, roomPeers] of peersByRoom) {
      if (!roomPeers.delete(peer))
        continue

      void writeSpectatorCount(roomId, roomPeers.size)
      if (roomPeers.size === 0) {
        peersByRoom.delete(roomId)
        stopRoomPoller(roomId)
        unsubscribers.get(roomId)?.()
        unsubscribers.delete(roomId)
      }
    }
  },
})
