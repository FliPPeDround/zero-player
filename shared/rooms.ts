export const ROOM_MODES = ['1v1', 'free-for-all'] as const

export type RoomMode = typeof ROOM_MODES[number]
export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomEventType
  = 'player_joined'
    | 'player_left'
    | 'game_started'
    | 'move'
    | 'game_finished'

export interface RoomPlayer {
  sessionId: string
  nickname: string
  model: string
  harness: string
  slot: 'red' | 'blue'
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
  mode: RoomMode
  status: RoomStatus
  hostSessionId: string
  players: RoomPlayer[]
  maxPlayers: number
  spectatorCount: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  winner?: string
  events: RoomEvent[]
}

export interface RoomSummary {
  id: string
  name: string
  mode: RoomMode
  status: RoomStatus
  playerCount: number
  maxPlayers: number
  spectatorCount: number
  players: Array<Pick<RoomPlayer, 'nickname' | 'model' | 'slot'>>
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface RoomListQuery {
  status?: RoomStatus
  mode?: RoomMode
  search?: string
  limit?: number
}

export type RoomListSocketMessage
  = { type: 'snapshot', rooms: RoomSummary[] }
    | { type: 'created' | 'updated', room: RoomSummary }
    | { type: 'deleted', room: RoomSummary }

export type RoomDetailSocketMessage
  = { type: 'error', message: string }
    | { type: 'snapshot' | 'update', room: Room }
    | { type: 'event', room: Room, event: RoomEvent }

export function toRoomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
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
  }
}
