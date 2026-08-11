import type { Peer } from 'crossws'
import { getLatestRoomSnapshot, getRoom, onRoomDetail, setSpectatorCount } from '../../../utils/room-store'

const peersByRoom = new Map<string, Set<Peer>>()
const unsubscribers = new Map<string, () => void>()
const roomIdPattern = /^\/ws\/rooms\/([^/]+)$/

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

export default defineWebSocketHandler({
  async open(peer) {
    const roomId = roomIdFromUrl(peer.request.url)
    if (!roomId) {
      safeSend(peer, { type: 'error', message: 'Room not found' })
      peer.close()
      return
    }
    const cached = getLatestRoomSnapshot(roomId)
    const stored = await getRoom(roomId)
    if (!cached && !stored) {
      safeSend(peer, { type: 'error', message: 'Room not found' })
      peer.close()
      return
    }

    const roomPeers = peersByRoom.get(roomId) ?? new Set<Peer>()
    roomPeers.add(peer)
    peersByRoom.set(roomId, roomPeers)
    await setSpectatorCount(roomId, roomPeers.size)

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

      void setSpectatorCount(roomId, roomPeers.size)
      if (roomPeers.size === 0) {
        peersByRoom.delete(roomId)
        unsubscribers.get(roomId)?.()
        unsubscribers.delete(roomId)
      }
    }
  },
})
