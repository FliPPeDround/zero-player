import type { GameActionRecord } from '#shared/game'
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
import { randomUUID } from 'node:crypto'
import { getGame } from '#shared/games'
import { toRoomSummary } from '#shared/rooms'
import { createGameInstance } from '../games/registry'

export type RoomListMessage = RoomListSocketMessage
export type RoomDetailMessage = RoomDetailSocketMessage

type ListListener = (message: RoomListMessage) => void
type DetailListener = (message: RoomDetailMessage) => void

const ROOM_KEY_PREFIX = 'rooms:'
const listListeners = new Set<ListListener>()
const detailListeners = new Map<string, Set<DetailListener>>()

let eventCounter = 0

function roomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId}`
}

function randomId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 6)}`
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
  return event
}

function addPlayer(room: Room, agent: AgentIdentity): RoomPlayer {
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
  return player
}

async function persistRoom(room: Room, type: 'created' | 'updated'): Promise<void> {
  await kv.set(roomKey(room.id), room)
  emitList(type, room)
  emitDetail(room.id, { type: 'update', room })
}

async function startGame(room: Room): Promise<void> {
  room.status = 'playing'
  room.startedAt = new Date().toISOString()
  room.game = createGameInstance(room).snapshot()
  appendEvent(room, 'game_started')
  await persistRoom(room, 'updated')
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

export async function createRoom(
  agent: AgentIdentity,
  options: { name?: string, gameId: string },
): Promise<Room> {
  const game = getGame(options.gameId)
  if (!game)
    throw createError({ statusCode: 400, statusMessage: `Unknown game: ${options.gameId}` })

  const activeRoom = await findActiveRoomForSession(agent.sessionId)
  if (activeRoom)
    throw createError({ statusCode: 409, statusMessage: `You are already in room ${activeRoom.id}; leave it first` })

  let id = randomId('r')
  while (await kv.has(roomKey(id)))
    id = randomId('r')

  const room: Room = {
    id,
    name: options.name?.trim() || `${agent.nickname}'s room`,
    gameId: game.id,
    mode: game.mode,
    status: 'waiting',
    hostSessionId: agent.sessionId,
    players: [],
    maxPlayers: game.maxPlayers,
    spectatorCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  }

  addPlayer(room, agent)
  await persistRoom(room, 'created')
  return room
}

export async function listRooms(query: {
  status?: Room['status']
  gameId?: string
  mode?: RoomMode
  search?: string
  limit?: number
} = {}): Promise<RoomSummary[]> {
  const search = query.search?.trim().toLowerCase()
  const limit = Math.min(query.limit ?? 100, 200)
  const keys = await kv.keys(ROOM_KEY_PREFIX)
  const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
  const rooms = storedRooms.filter((room): room is Room => room !== null)

  return rooms
    .filter(room => !query.status || room.status === query.status)
    .filter(room => !query.gameId || room.gameId === query.gameId)
    .filter(room => !query.mode || room.mode === query.mode)
    .filter(room => !search || (
      room.name.toLowerCase().includes(search)
      || room.id.toLowerCase().includes(search)
      || room.gameId.toLowerCase().includes(search)
      || room.players.some(player => player.nickname.toLowerCase().includes(search))
    ))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(toRoomSummary)
}

export async function getRoom(roomId: string): Promise<Room | null> {
  return await kv.get<Room>(roomKey(roomId))
}

export async function requireRoom(roomId: string): Promise<Room> {
  const room = await getRoom(roomId)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  return room
}

export async function findActiveRoomForSession(sessionId: string): Promise<Room | null> {
  const keys = await kv.keys(ROOM_KEY_PREFIX)
  const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
  return storedRooms.find((room): room is Room => (
    room !== null
    && room.status !== 'finished'
    && room.players.some(player => player.sessionId === sessionId)
  )) ?? null
}

export async function requireActiveRoomForSession(sessionId: string): Promise<Room> {
  const room = await findActiveRoomForSession(sessionId)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'You are not in any active room' })
  return room
}

export async function joinRoom(roomId: string, agent: AgentIdentity): Promise<Room> {
  const room = await requireRoom(roomId)
  const activeRoom = await findActiveRoomForSession(agent.sessionId)

  if (activeRoom && activeRoom.id !== roomId)
    throw createError({ statusCode: 409, statusMessage: `You are already in room ${activeRoom.id}; leave it first` })

  if (room.status !== 'waiting')
    throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}; it is no longer accepting players` })
  if (room.players.some(player => player.sessionId === agent.sessionId))
    return room
  if (room.players.length >= room.maxPlayers)
    throw createError({ statusCode: 409, statusMessage: 'Room is full' })

  addPlayer(room, agent)

  if (room.players.length === room.maxPlayers)
    await startGame(room)
  else
    await persistRoom(room, 'updated')

  return room
}

export async function leaveRoom(roomId: string, agent: AgentIdentity): Promise<Room> {
  const room = await requireRoom(roomId)
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
    await kv.del(roomKey(room.id))
    emitList('deleted', room)
    emitDetail(room.id, { type: 'update', room })
    return room
  }

  await persistRoom(room, 'updated')
  return room
}

export async function setSpectatorCount(roomId: string, count: number): Promise<void> {
  const room = await getRoom(roomId)
  if (!room)
    return
  const normalized = Math.max(0, count)
  if (room.spectatorCount === normalized)
    return
  room.spectatorCount = normalized
  await persistRoom(room, 'updated')
}

export async function emitGameMove(roomId: string, actor: string, payload: Record<string, unknown>): Promise<void> {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'playing')
    return
  appendEvent(room, 'move', actor, payload)
  await persistRoom(room, 'updated')
}

/**
 * Authoritative entry point for gameplay. Any player (agent via MCP/API,
 * future human input) submits an action through here; the game engine
 * validates it, the new snapshot is persisted and broadcast, and the room is
 * finished when the engine reports a terminal state.
 */
export async function submitGameMove(
  roomId: string,
  playerId: string,
  action: GameActionRecord,
): Promise<Room> {
  const room = await requireRoom(roomId)

  if (room.status !== 'playing')
    throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}` })

  const game = createGameInstance(room)
  const outcome = game.play(playerId, action)
  if (!outcome.ok)
    throw createError({ statusCode: 409, statusMessage: outcome.error })

  room.game = game.snapshot()
  const actor = room.players.find(player => player.sessionId === playerId)?.nickname
  appendEvent(room, 'move', actor, { ...action })
  await persistRoom(room, 'updated')

  if (game.status === 'finished') {
    const winnerNickname = room.players.find(player => player.sessionId === game.winner)?.nickname
    await finishGame(roomId, winnerNickname ?? game.winner)
  }

  return await getRoom(roomId) ?? room
}

export async function finishGame(roomId: string, winner?: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'playing')
    return
  room.status = 'finished'
  room.finishedAt = new Date().toISOString()
  room.winner = winner
  appendEvent(room, 'game_finished', undefined, {
    winner,
    reason: room.game?.finishReason,
  })
  await persistRoom(room, 'updated')
}
