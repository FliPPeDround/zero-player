import type { Peer } from 'crossws'
import { listRooms, onRoomList } from '../../utils/room-store'

const peers = new Set<Peer>()
let registered = false

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)

    if (!registered) {
      registered = true
      onRoomList((message) => {
        const payload = JSON.stringify(message)
        for (const connected of peers)
          connected.send(payload)
      })
    }

    peer.send(JSON.stringify({ type: 'snapshot', rooms: listRooms() }))
  },
  close(peer) {
    peers.delete(peer)
  },
})
