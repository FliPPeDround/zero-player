import type { Peer } from 'crossws'

/**
 * Send a JSON payload to a websocket peer without throwing: the peer can be
 * closing or reset while a broadcast iterates the connected set.
 */
export function safeSend(peer: Peer, payload: unknown): void {
  try {
    peer.send(JSON.stringify(payload))
  }
  catch {
    // Nothing to do; the peer is gone.
  }
}
