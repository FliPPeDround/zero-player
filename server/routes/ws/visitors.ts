import type { Peer } from 'crossws'
import { safeSend } from '../../utils/ws'

const peers = new Set<Peer>()

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    // We subscribe to the 'visitors' channel
    peer.subscribe('visitors')
    // We publish the number of connected users to the 'visitors' channel
    peer.publish('visitors', peers.size)
    // We send the number of connected users to the client
    safeSend(peer, peers.size)
  },
  close(peer) {
    peers.delete(peer)
    peer.unsubscribe('visitors')
    // Wait 500ms before sending the updated count to the clients
    setTimeout(() => {
      peer.publish('visitors', peers.size)
    }, 500)
  },
})
