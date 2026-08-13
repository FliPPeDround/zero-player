import type { RoomListSocketMessage, RoomSummary } from '#shared/rooms'
import type { Peer } from 'crossws'
import { listRooms, onRoomList } from '../../utils/room-store'

const peers = new Set<Peer>()
let registered = false

/**
 * Same safety net as the room-detail handler: the REST→Durable Object bridge
 * is the fast path, and a short KV poll is the fallback so the lobby catches
 * up even when the bridge is down. `listRooms` keeps a 10s KV cache, so the
 * polling stays cheap while several tabs watch the lobby.
 */
const LOBBY_POLL_INTERVAL_MS = 3000
const LOBBY_BRIDGE_SKIP_MS = 2000
let lobbyTimer: ReturnType<typeof setInterval> | null = null
let lastLobbyKey = ''
let lastBridgePushAt = 0

function lobbyKey(rooms: RoomSummary[]): string {
  return rooms
    .map(room => `${room.id}:${room.updatedAt}:${room.status}:${room.playerCount}:${room.spectatorCount}`)
    .join('|')
}

function stopLobbyTimer(): void {
  if (lobbyTimer) {
    clearInterval(lobbyTimer)
    lobbyTimer = null
  }
}

function ensureLobbyTimer(): void {
  if (lobbyTimer)
    return
  lobbyTimer = setInterval(() => {
    void pollLobby()
  }, LOBBY_POLL_INTERVAL_MS)
}

async function pollLobby(): Promise<void> {
  if (peers.size === 0) {
    stopLobbyTimer()
    return
  }
  try {
    const rooms = await listRooms()
    const key = lobbyKey(rooms)
    // A recent bridge push already delivered the change; skip the redundant snapshot.
    if (key !== lastLobbyKey && Date.now() - lastBridgePushAt >= LOBBY_BRIDGE_SKIP_MS) {
      lastLobbyKey = key
      const message: RoomListSocketMessage = { type: 'snapshot', rooms }
      for (const connected of peers)
        safeSend(connected, message)
    }
  }
  catch (error) {
    console.error('[rooms] lobby poll failed:', error)
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

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    ensureLobbyTimer()

    if (!registered) {
      registered = true
      onRoomList((message) => {
        lastBridgePushAt = Date.now()
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
    if (peers.size === 0)
      stopLobbyTimer()
  },
})
