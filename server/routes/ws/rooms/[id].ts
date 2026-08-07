import type { Peer } from 'crossws'
import { getRoom, onRoomDetail, setSpectatorCount } from '../../../utils/room-store'

const peersByRoom = new Map<string, Set<Peer>>()
const unsubscribers = new Map<string, () => void>()
const roomIdPattern = /^\/ws\/rooms\/([^/]+)$/

function roomIdFromUrl(url: string): string | null {
  const pathname = new URL(url, 'http://localhost').pathname
  return pathname.match(roomIdPattern)?.[1] ?? null
}

export default defineWebSocketHandler({
  open(peer) {
    const roomId = roomIdFromUrl(peer.request.url)
    if (!roomId || !getRoom(roomId)) {
      peer.send(JSON.stringify({ type: 'error', message: 'Room not found' }))
      peer.close()
      return
    }

    const roomPeers = peersByRoom.get(roomId) ?? new Set<Peer>()
    roomPeers.add(peer)
    peersByRoom.set(roomId, roomPeers)
    setSpectatorCount(roomId, roomPeers.size)

    if (!unsubscribers.has(roomId)) {
      unsubscribers.set(
        roomId,
        onRoomDetail(roomId, (message) => {
          const payload = JSON.stringify(message)
          for (const connected of peersByRoom.get(roomId) ?? [])
            connected.send(payload)
        }),
      )
    }

    peer.send(JSON.stringify({ type: 'snapshot', room: getRoom(roomId) }))
  },
  close(peer) {
    for (const [roomId, roomPeers] of peersByRoom) {
      if (!roomPeers.delete(peer))
        continue

      setSpectatorCount(roomId, roomPeers.size)
      if (roomPeers.size === 0) {
        peersByRoom.delete(roomId)
        unsubscribers.get(roomId)?.()
        unsubscribers.delete(roomId)
      }
    }
  },
})
