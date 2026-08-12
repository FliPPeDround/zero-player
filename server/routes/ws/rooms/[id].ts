import type { Peer } from 'crossws'
import { getLatestRoomSnapshot, getRoom, onRoomDetail, setSpectatorCount } from '../../../utils/room-store'

const peersByRoom = new Map<string, Set<Peer>>()
const unsubscribers = new Map<string, () => void>()
const roomIdPattern = /^\/ws\/rooms\/([^/]+)$/
const SPECTATOR_DEBOUNCE_MS = 5000
const spectatorWrites = new Map<string, { count: number, lastWriteAt: number, timer?: ReturnType<typeof setTimeout> }>()

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
      safeSend(peer, { type: 'error', code: 'room_not_found', message: 'Room not found' })
      peer.close()
      return
    }
    const cached = getLatestRoomSnapshot(roomId)
    const stored = await getRoom(roomId)
    if (!cached && !stored) {
      safeSend(peer, { type: 'error', code: 'room_not_found', message: 'Room not found' })
      peer.close()
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
          for (const connected of peersByRoom.get(roomId) ?? [])
            safeSend(connected, message)
        }),
      )
    }

    const snapshot = cached && stored && cached.events.length > stored.events.length
      ? cached
      : (stored ?? cached)
    safeSend(peer, { type: 'snapshot', room: snapshot })
  },
  close(peer) {
    for (const [roomId, roomPeers] of peersByRoom) {
      if (!roomPeers.delete(peer))
        continue

      void writeSpectatorCount(roomId, roomPeers.size)
      if (roomPeers.size === 0) {
        peersByRoom.delete(roomId)
        unsubscribers.get(roomId)?.()
        unsubscribers.delete(roomId)
      }
    }
  },
})
