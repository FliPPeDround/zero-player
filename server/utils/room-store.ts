import type {
  Room,
  RoomDetailSocketMessage,
  RoomEvent,
  RoomEventType,
  RoomListSocketMessage,
  RoomMode,
  RoomPlayer,
  RoomSummary,
} from '#shared/rooms'
import type { AgentIdentity } from './agent'
import { ROOM_MODES, toRoomSummary } from '#shared/rooms'

export type RoomListMessage = RoomListSocketMessage
export type RoomDetailMessage = RoomDetailSocketMessage

type ListListener = (message: RoomListMessage) => void
type DetailListener = (message: RoomDetailMessage) => void

const rooms = new Map<string, Room>()
const listListeners = new Set<ListListener>()
const detailListeners = new Map<string, Set<DetailListener>>()

let eventCounter = 0

function randomId(prefix: string, length = 6): string {
  const suffix = Math.random().toString(36).slice(2, 2 + length)
  return `${prefix}-${suffix}`
}

function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now().toString(36)}-${eventCounter.toString(36)}`
}

function emitList(type: RoomListMessage['type'], room: Room): void {
  const summary = toRoomSummary(room)
  const message: RoomListMessage = type === 'deleted'
    ? { type: 'deleted', room: summary }
    : { type: type === 'created' ? 'created' : 'updated', room: summary }
  for (const listener of listListeners)
    listener(message)
}

function emitDetail(roomId: string, message: RoomDetailMessage): void {
  const listeners = detailListeners.get(roomId)
  if (!listeners)
    return
  for (const listener of listeners)
    listener(message)
}

function touch(room: Room): void {
  room.updatedAt = new Date().toISOString()
}

function appendEvent(
  room: Room,
  type: RoomEventType,
  actor?: string,
  payload?: Record<string, unknown>,
): RoomEvent {
  const event: RoomEvent = {
    id: nextEventId(),
    type,
    at: new Date().toISOString(),
    actor,
    payload,
  }
  room.events.push(event)
  touch(room)
  emitDetail(room.id, { type: 'event', room, event })
  return event
}

function notifyUpdate(room: Room): void {
  emitList('updated', room)
  emitDetail(room.id, { type: 'update', room })
}

function addPlayer(
  room: Room,
  agent: AgentIdentity,
  options: { notify?: boolean } = {},
): RoomPlayer {
  const slot = room.players.some(player => player.slot === 'red') ? 'blue' : 'red'
  const player: RoomPlayer = {
    sessionId: agent.sessionId,
    nickname: agent.nickname,
    model: agent.model,
    harness: agent.harness,
    slot,
    joinedAt: new Date().toISOString(),
  }
  room.players.push(player)
  appendEvent(room, 'player_joined', agent.nickname)
  if (options.notify !== false)
    notifyUpdate(room)
  return player
}

function startGame(room: Room): void {
  room.status = 'playing'
  room.startedAt = new Date().toISOString()
  appendEvent(room, 'game_started')
  notifyUpdate(room)
  void startDemoBattle(room.id)
}

async function startDemoBattle(roomId: string): Promise<void> {
  try {
    const { runDemoBattle } = await import('./demo-battle')
    runDemoBattle(roomId)
  }
  catch (error) {
    console.error('[rooms] failed to start demo battle', error)
  }
}

export function onRoomList(listener: ListListener): () => void {
  listListeners.add(listener)
  return () => listListeners.delete(listener)
}

export function onRoomDetail(roomId: string, listener: DetailListener): () => void {
  const listeners = detailListeners.get(roomId) ?? new Set<DetailListener>()
  listeners.add(listener)
  detailListeners.set(roomId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0)
      detailListeners.delete(roomId)
  }
}

export function createRoom(
  agent: AgentIdentity,
  options: { name?: string, mode?: RoomMode, maxPlayers?: number } = {},
): Room {
  const mode = options.mode ?? '1v1'
  const maxPlayers = options.maxPlayers ?? 2

  if (!ROOM_MODES.includes(mode))
    throw createError({ statusCode: 400, statusMessage: `Unsupported room mode: ${mode}` })
  if (maxPlayers < 2 || maxPlayers > 8)
    throw createError({ statusCode: 400, statusMessage: 'maxPlayers must be between 2 and 8' })

  let id = randomId('r')
  while (rooms.has(id))
    id = randomId('r')

  const room: Room = {
    id,
    name: options.name?.trim() || `${agent.nickname}'s room`,
    mode,
    status: 'waiting',
    hostSessionId: agent.sessionId,
    players: [],
    maxPlayers,
    spectatorCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  }

  rooms.set(room.id, room)
  addPlayer(room, agent, { notify: false })
  emitList('created', room)
  return room
}

export function listRooms(query: {
  status?: Room['status']
  mode?: RoomMode
  search?: string
  limit?: number
} = {}): RoomSummary[] {
  const search = query.search?.trim().toLowerCase()
  const limit = Math.min(query.limit ?? 100, 200)

  return [...rooms.values()]
    .filter(room => !query.status || room.status === query.status)
    .filter(room => !query.mode || room.mode === query.mode)
    .filter(room => !search || (
      room.name.toLowerCase().includes(search)
      || room.id.toLowerCase().includes(search)
      || room.players.some(player => player.nickname.toLowerCase().includes(search))
    ))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(toRoomSummary)
}

export function getRoom(roomId: string): Room | null {
  return rooms.get(roomId) ?? null
}

export function requireRoom(roomId: string): Room {
  const room = getRoom(roomId)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  return room
}

export function joinRoom(roomId: string, agent: AgentIdentity): Room {
  const room = requireRoom(roomId)

  if (room.status !== 'waiting')
    throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}; it is no longer accepting players` })
  if (room.players.some(player => player.sessionId === agent.sessionId))
    return room
  if (room.players.length >= room.maxPlayers)
    throw createError({ statusCode: 409, statusMessage: 'Room is full' })

  addPlayer(room, agent)

  if (room.players.length === room.maxPlayers)
    startGame(room)

  return room
}

export function leaveRoom(roomId: string, agent: AgentIdentity): Room {
  const room = requireRoom(roomId)
  const index = room.players.findIndex(player => player.sessionId === agent.sessionId)

  if (index === -1)
    throw createError({ statusCode: 409, statusMessage: 'You are not in this room' })
  if (room.status === 'playing')
    throw createError({ statusCode: 409, statusMessage: 'Cannot leave while the game is running' })

  const [leaver] = room.players.splice(index, 1)
  appendEvent(room, 'player_left', leaver?.nickname)

  if (room.hostSessionId === leaver?.sessionId && room.players[0])
    room.hostSessionId = room.players[0].sessionId

  if (room.players.length === 0) {
    rooms.delete(room.id)
    emitList('deleted', room)
    emitDetail(room.id, { type: 'update', room })
    return room
  }

  notifyUpdate(room)
  return room
}

export function setSpectatorCount(roomId: string, count: number): void {
  const room = getRoom(roomId)
  if (!room)
    return
  room.spectatorCount = Math.max(0, count)
  notifyUpdate(room)
}

export function emitGameMove(roomId: string, actor: string, payload: Record<string, unknown>): void {
  const room = getRoom(roomId)
  if (!room || room.status !== 'playing')
    return
  appendEvent(room, 'move', actor, payload)
  notifyUpdate(room)
}

export function finishGame(roomId: string, winner?: string): void {
  const room = getRoom(roomId)
  if (!room || room.status !== 'playing')
    return
  room.status = 'finished'
  room.finishedAt = new Date().toISOString()
  room.winner = winner
  appendEvent(room, 'game_finished', undefined, { winner })
  notifyUpdate(room)
}
