import type { GameSnapshot } from './game'

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'aborted'

export type RoomEventType
  = 'player_joined'
    | 'player_left'
    | 'player_ready'
    | 'game_started'
    | 'move'
    | 'game_finished'
    | 'game_aborted'
    | 'room_closed'

export interface RoomPlayer {
  sessionId: string
  nickname: string
  model: string
  harness: string
  slot: string
  joinedAt: string
}

export interface RoomEvent {
  id: string
  type: RoomEventType
  at: string
  actor?: string
  payload?: Record<string, unknown>
}

export interface Room {
  id: string
  name: string
  gameId: string
  status: RoomStatus
  hostSessionId: string
  players: RoomPlayer[]
  /**
   * Session ids that have called `start-game` while the room is waiting.
   * Each caller marks themselves ready; the game starts only when every
   * seated player is in this list.
   */
  readySessionIds: string[]
  maxPlayers: number
  spectatorCount: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  /**
   * Session id -> ISO time the player called `start-game`. Race games (e.g.
   * 24 Point) use each player's own timestamp as the start of their personal
   * clock, instead of the room-level `startedAt` set when the last player
   * became ready.
   */
  readyAt?: Record<string, string>
  finishedAt?: string
  abortedAt?: string
  /**
   * ISO deadline after which a running room whose player left is aborted as
   * abandoned. The room stays `playing` until then so an accidental leave
   * can be undone by rejoining (`pendingLeaveSessionId`).
   */
  pendingLeaveAt?: string
  /** Session id of the player whose leave is waiting out the grace period. */
  pendingLeaveSessionId?: string
  /** Session id of the winning player; absent on draws and aborts. */
  winner?: string
  events: RoomEvent[]
  /**
   * ISO timestamp after which the room is automatically closed. `waiting` and
   * `playing` rooms keep extending it on activity; terminal rooms keep it
   * fixed at finish/abort time plus the retention window.
   */
  closesAt?: string
  /** Serialized game instance attached to this room while it exists. */
  game?: GameSnapshot
}

export interface RoomSummary {
  id: string
  name: string
  gameId: string
  status: RoomStatus
  playerCount: number
  readyCount: number
  maxPlayers: number
  spectatorCount: number
  players: Array<Pick<RoomPlayer, 'sessionId' | 'nickname' | 'model' | 'slot'>>
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  abortedAt?: string
  closesAt?: string
}

export type RoomListSocketMessage
  = { type: 'snapshot', rooms: RoomSummary[] }
    | { type: 'created' | 'updated', room: RoomSummary }
    | { type: 'deleted', room: RoomSummary }

export type RoomDetailSocketMessage
  = { type: 'error', code: 'room_not_found', message: string }
    | { type: 'snapshot' | 'update', room: Room }
    | { type: 'closed', room: Room }
    | { type: 'event', room: Room, event: RoomEvent }

export function toRoomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    gameId: room.gameId,
    status: room.status,
    playerCount: room.players.length,
    readyCount: room.readySessionIds?.length ?? 0,
    maxPlayers: room.maxPlayers,
    spectatorCount: room.spectatorCount,
    players: room.players.map(p => ({
      sessionId: p.sessionId,
      nickname: p.nickname,
      model: p.model,
      slot: p.slot,
    })),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    abortedAt: room.abortedAt,
    closesAt: room.closesAt,
  }
}
