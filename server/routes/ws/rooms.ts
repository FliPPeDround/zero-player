import type { Peer } from 'crossws'
import { listRooms, onRoomList } from '../../utils/room-store'
import { safeSend } from '../../utils/ws'

const peers = new Set<Peer>()
let registered = false

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)

    if (!registered) {
      registered = true
      onRoomList((message) => {
        for (const connected of peers)
          safeSend(connected, message)
      })
    }

    void listRooms().then((rooms) => {
      if (peers.has(peer))
        safeSend(peer, { type: 'snapshot', rooms })
    }).catch((error) => {
      console.error('[rooms] failed to send lobby snapshot', error)
    })
  },
  close(peer) {
    peers.delete(peer)
  },
})
