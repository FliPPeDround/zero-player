import type { Peer } from 'crossws'
import { listRooms, onRoomList } from '../../utils/room-store'

const peers = new Set<Peer>()
let registered = false

function safeSend(peer: Peer, payload: unknown): void {
  try {
    peer.send(JSON.stringify(payload))
  }
  catch {
    // Peer can be closing/reset while we broadcast; nothing to do.
  }
}

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
