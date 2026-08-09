import type { Peer } from 'crossws'

const peers = new Set<Peer>()

function safeSend(peer: Peer, payload: unknown): void {
  try {
    peer.send(payload)
  }
  catch {
    // Peer can be closing/reset while we broadcast; nothing to do.
  }
}

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
