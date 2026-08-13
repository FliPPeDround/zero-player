import type { GameSnapshot } from './game'

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'aborted'

export type RoomEventType
  = 'player_joined'
    | 'player_left'
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
  maxPlayers: number
  spectatorCount: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  abortedAt?: string
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
  maxPlayers: number
  spectatorCount: number
  players: Array<Pick<RoomPlayer, 'nickname' | 'model' | 'slot'>>
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
    maxPlayers: room.maxPlayers,
    spectatorCount: room.spectatorCount,
    players: room.players.map(p => ({
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
