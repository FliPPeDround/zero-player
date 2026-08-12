import type { GameActionRecord } from '#shared/game'
import type {
  Room,
  RoomDetailSocketMessage,
  RoomEvent,
  RoomEventType,
  RoomListSocketMessage,
  RoomPlayer,
  RoomSummary,
} from '#shared/rooms'
import type { AgentIdentity } from './agent'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { getGame } from '#shared/games'
import { toRoomSummary } from '#shared/rooms'
import { createGameInstance } from '../games/registry'
import { persistFinishedGame } from './game-dataset'

export type RoomListMessage = RoomListSocketMessage
export type RoomDetailMessage = RoomDetailSocketMessage

type ListListener = (message: RoomListMessage) => void
type DetailListener = (message: RoomDetailMessage) => void

const ROOM_KEY_PREFIX = 'rooms:'
const SPECTATOR_KEY_PREFIX = 'spectators:'
const SESSION_KEY_PREFIX = 'session:'
const SESSION_INDEX_TTL_SECONDS = 60 * 60 * 24 * 7
const listListeners = new Set<ListListener>()
const detailListeners = new Map<string, Set<DetailListener>>()
const latestRoomSnapshots = new Map<string, Room>()

const WAITING_IDLE_MS = envMs('ROOMS_WAITING_IDLE_MS', 60 * 60 * 1000)
const STALL_TIMEOUT_MS = envMs('ROOMS_STALL_TIMEOUT_MS', 60 * 60 * 1000)
const TERMINAL_RETENTION_MS = envMs('ROOMS_TERMINAL_RETENTION_MS', 10 * 60 * 1000)
const KV_TTL_MAX_SECONDS = 60 * 60 * 24 * 7
const DURABLE_BINDING_NAME = '$DurableObject'
const DURABLE_INSTANCE_NAME = 'server'

let eventCounter = 0

export interface RoomHubBroadcast {
  roomId: string
  list: RoomUpdateListMessage
  detail: RoomDetailMessage
}

export type RoomUpdateListMessage
  = { type: 'created' | 'updated', room: RoomSummary }
    | { type: 'deleted', room: RoomSummary }

interface DurableObjectStub {
  fetch: (request: Request) => Promise<Response>
}

interface DurableObjectBinding {
  idFromName: (name: string) => unknown
  get: (id: unknown) => DurableObjectStub
}

type DurableGlobal = typeof globalThis & {
  __env__?: Record<string, unknown>
  __zeroPlayerDurableObject?: boolean
}

function envMs(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw)
    return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function roomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId}`
}

function spectatorKey(roomId: string): string {
  return `${SPECTATOR_KEY_PREFIX}${roomId}`
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`
}

async function setSessionRoom(sessionId: string, roomId: string): Promise<void> {
  await kv.set(sessionKey(sessionId), roomId, { ttl: SESSION_INDEX_TTL_SECONDS })
}

async function clearSessionRoom(sessionId: string): Promise<void> {
  await kv.del(sessionKey(sessionId))
}

async function clearRoomSessions(room: Room): Promise<void> {
  await Promise.all(room.players.map(player => clearSessionRoom(player.sessionId)))
}

function randomId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 6)}`
}

function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now().toString(36)}-${eventCounter.toString(36)}`
}

function emitList(type: 'created' | 'updated' | 'deleted', room: Room | RoomSummary): RoomUpdateListMessage {
  const summary = 'hostSessionId' in room ? toRoomSummary(room) : room
  const message: RoomUpdateListMessage = type === 'deleted'
    ? { type: 'deleted', room: summary }
    : { type: type === 'created' ? 'created' : 'updated', room: summary }
  for (const listener of listListeners)
    listener(message)
  return message
}

function emitDetail(roomId: string, message: RoomDetailMessage): RoomDetailMessage {
  const listeners = detailListeners.get(roomId)
  if (!listeners)
    return message
  for (const listener of listeners)
    listener(message)
  return message
}

/**
 * Resolve the Nitro WebSocket Durable Object stub when running in a regular
 * Cloudflare Worker. WebSocket handlers live in `$DurableObject`, so room
 * updates produced by REST/scheduled work must be forwarded there to reach
 * browser peers. Inside the Durable Object itself we skip the forward and
 * emit locally instead.
 */
function getDurableObjectStub(): DurableObjectStub | null {
  const g = globalThis as DurableGlobal
  if (g.__zeroPlayerDurableObject)
    return null
  try {
    const event = useEvent()
    const durableFetch = (event.context._platform?.cloudflare as {
      durableFetch?: (request: Request) => Promise<Response>
    } | undefined)?.durableFetch
    if (typeof durableFetch === 'function')
      return { fetch: request => durableFetch(request) }
  }
  catch {
    // Not inside a Nitro request (e.g. a scheduled task): fall back to the
    // Durable Object binding directly.
  }
  const binding = g.__env__?.[DURABLE_BINDING_NAME] as DurableObjectBinding | undefined
  if (!binding)
    return null
  try {
    return binding.get(binding.idFromName(DURABLE_INSTANCE_NAME))
  }
  catch {
    return null
  }
}

async function broadcastToDurable(payload: RoomHubBroadcast): Promise<void> {
  const stub = getDurableObjectStub()
  if (!stub)
    return
  try {
    await stub.fetch(new Request('http://internal/api/internal/ws-broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  }
  catch (error) {
    // The room is already persisted and emitted locally; a failed WS bridge
    // must not fail the request. Peers will catch up on their next snapshot.
    console.error('[rooms] failed to broadcast to WebSocket durable object:', error)
  }
}

/**
 * Re-dispatch a room broadcast inside the Durable Object that owns WebSocket
 * peers. Only the internal WS bridge route should call this.
 */
export function dispatchRoomHubBroadcast(payload: RoomHubBroadcast): void {
  if ('room' in payload.detail) {
    if (payload.detail.type === 'closed')
      latestRoomSnapshots.delete(payload.roomId)
    else
      latestRoomSnapshots.set(payload.roomId, payload.detail.room)
  }
  emitList(payload.list.type, payload.list.room)
  emitDetail(payload.roomId, payload.detail)
}

/**
 * Latest full room seen by this isolate from the REST→Durable Object bridge.
 * Used by the WebSocket handler for initial snapshots so a client joining
 * mid-game does not briefly get an older KV snapshot that would revert the
 * board it just received.
 */
export function getLatestRoomSnapshot(roomId: string): Room | null {
  return latestRoomSnapshots.get(roomId) ?? null
}

/**
 * Legacy rooms stored players with hardcoded `red`/`blue` slots. Now slots are
 * game side keys (e.g. `black`/`white` for Gomoku), so remap players by join
 * order whenever the stored slots no longer match the game definition.
 */
function normalizeRoomSides(room: Room): void {
  const sides = getGame(room.gameId)?.sides ?? []
  if (!sides.length)
    return
  const matches = room.players.every((player, index) => player.slot === sides[index]?.key)
  if (matches)
    return
  room.players.forEach((player, index) => {
    player.slot = sides[index]?.key ?? `seat-${index + 1}`
  })
}

function touch(room: Room): void {
  room.updatedAt = new Date().toISOString()
}

function isTerminalStatus(status: Room['status']): boolean {
  return status === 'finished' || status === 'aborted'
}

/**
 * Deadline after which the room is closed. `waiting`/`playing` rooms keep
 * extending it on activity (`updatedAt`); terminal rooms keep it fixed at
 * finish/abort time plus the retention window so spectators can review the
 * result before the room disappears.
 */
function computeClosesAt(room: Room): string | undefined {
  const deadlineMs = (() => {
    if (room.status === 'waiting')
      return new Date(room.updatedAt).getTime() + WAITING_IDLE_MS
    if (room.status === 'playing')
      return new Date(room.updatedAt).getTime() + STALL_TIMEOUT_MS
    if (room.status === 'finished' && room.finishedAt)
      return new Date(room.finishedAt).getTime() + TERMINAL_RETENTION_MS
    if (room.status === 'aborted' && room.abortedAt)
      return new Date(room.abortedAt).getTime() + TERMINAL_RETENTION_MS
    return undefined
  })()
  return deadlineMs === undefined ? undefined : new Date(deadlineMs).toISOString()
}

function ttlSecondsUntil(room: Room): number | undefined {
  if (!room.closesAt)
    return undefined
  const seconds = Math.ceil((new Date(room.closesAt).getTime() - Date.now()) / 1000)
  return Math.min(Math.max(seconds, 60), KV_TTL_MAX_SECONDS)
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
  const sides = getGame(room.gameId)?.sides ?? []
  const nextSide = sides.find(side => !room.players.some(player => player.slot === side.key))
  const slot = nextSide?.key ?? `seat-${room.players.length + 1}`
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
  room.closesAt = computeClosesAt(room)
  room.spectatorCount = await kv.get<number>(spectatorKey(room.id)) ?? room.spectatorCount
  const ttl = ttlSecondsUntil(room)
  await kv.set(roomKey(room.id), room, ttl ? { ttl } : undefined)
  const list = emitList(type, room)
  const detail = emitDetail(room.id, { type: 'update', room })
  await broadcastToDurable({ roomId: room.id, list, detail })
}

async function deleteRoom(roomId: string, reason = 'closed', by?: string): Promise<Room | null> {
  const room = await getRoom(roomId)
  if (!room)
    return null
  appendEvent(room, 'room_closed', by, { reason })
  await kv.del(roomKey(roomId))
  await kv.del(spectatorKey(roomId))
  await clearRoomSessions(room)
  const list = emitList('deleted', room)
  const detail = emitDetail(roomId, { type: 'closed', room })
  await broadcastToDurable({ roomId, list, detail })
  return room
}

/**
 * Interrupted game state: neither a win, loss nor draw — the match simply
 * cannot continue (stall timeout, host abandoning). Terminal like `finished`,
 * so the room follows the retention window before being deleted.
 */
async function abortRoom(room: Room, by?: string, reason: 'timeout' | 'abandoned' = 'timeout'): Promise<Room> {
  room.status = 'aborted'
  room.abortedAt = new Date().toISOString()
  room.winner = undefined
  if (room.game) {
    room.game.status = 'aborted'
    room.game.winner = undefined
    room.game.finishReason = reason
  }
  appendEvent(room, 'game_aborted', by, { reason })
  await persistRoom(room, 'updated')
  await clearRoomSessions(room)
  await persistFinishedGame(room)
  return room
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
  await setSessionRoom(agent.sessionId, room.id)
  return room
}

export async function listRooms(query: {
  status?: Room['status']
  gameId?: string
  search?: string
  limit?: number
} = {}): Promise<RoomSummary[]> {
  const search = query.search?.trim().toLowerCase()
  const limit = Math.min(query.limit ?? 100, 200)
  const keys = await kv.keys(ROOM_KEY_PREFIX)
  const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
  const rooms = storedRooms.filter((room): room is Room => room !== null)
  await Promise.all(rooms.map(async (room) => {
    room.spectatorCount = await kv.get<number>(spectatorKey(room.id)) ?? room.spectatorCount
  }))
  rooms.forEach(normalizeRoomSides)

  return rooms
    .filter(room => !query.status || room.status === query.status)
    .filter(room => !query.gameId || room.gameId === query.gameId)
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
  const room = await kv.get<Room>(roomKey(roomId))
  if (room) {
    normalizeRoomSides(room)
    room.spectatorCount = await kv.get<number>(spectatorKey(roomId)) ?? room.spectatorCount
  }
  return room
}

export async function requireRoom(roomId: string): Promise<Room> {
  const room = await getRoom(roomId)
  if (!room)
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  return room
}

export async function findActiveRoomForSession(sessionId: string): Promise<Room | null> {
  const roomId = await kv.get<string>(sessionKey(sessionId))
  if (!roomId)
    return null
  const room = await getRoom(roomId)
  if (!room || isTerminalStatus(room.status) || !room.players.some(player => player.sessionId === sessionId)) {
    await kv.del(sessionKey(sessionId))
    return null
  }
  return room
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
  if (room.players.some(player => player.sessionId === agent.sessionId)) {
    await setSessionRoom(agent.sessionId, room.id)
    return room
  }
  if (room.players.length >= room.maxPlayers)
    throw createError({ statusCode: 409, statusMessage: 'Room is full' })

  addPlayer(room, agent)

  if (room.players.length === room.maxPlayers)
    await startGame(room)
  else
    await persistRoom(room, 'updated')

  await setSessionRoom(agent.sessionId, room.id)
  return room
}

export async function leaveRoom(roomId: string, agent: AgentIdentity): Promise<Room> {
  const room = await requireRoom(roomId)
  const index = room.players.findIndex(player => player.sessionId === agent.sessionId)

  if (index === -1)
    throw createError({ statusCode: 409, statusMessage: 'You are not in this room' })

  if (room.status === 'playing')
    return await abortRoom(room, agent.nickname, 'abandoned')

  const [leaver] = room.players.splice(index, 1)
  appendEvent(room, 'player_left', leaver?.nickname)
  if (leaver)
    await clearSessionRoom(leaver.sessionId)

  if (room.hostSessionId === leaver?.sessionId && room.players[0])
    room.hostSessionId = room.players[0].sessionId

  if (room.players.length === 0) {
    return (await deleteRoom(room.id)) ?? room
  }

  await persistRoom(room, 'updated')
  return room
}

export async function setSpectatorCount(roomId: string, count: number): Promise<void> {
  const cached = getLatestRoomSnapshot(roomId)
  const stored = await getRoom(roomId)
  const room = cached && stored && cached.events.length > stored.events.length ? cached : stored
  if (!room)
    return
  const normalized = Math.max(0, count)
  if (room.spectatorCount === normalized)
    return
  const ttl = ttlSecondsUntil(room)
  // Keep spectator counts out of the authoritative room document: writing the
  // full room here can overwrite a newer move with a stale snapshot when the
  // WebSocket Durable Object and the REST Worker race on KV.
  await kv.set(spectatorKey(roomId), normalized, ttl ? { ttl } : undefined)
  room.spectatorCount = normalized
  emitList('updated', room)
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
  const player = room.players.find(player => player.sessionId === playerId)
  appendEvent(room, 'move', player?.nickname, {
    ...action,
    ...(player?.slot ? { side: player.slot } : {}),
  })
  await persistRoom(room, 'updated')

  if (game.status === 'finished') {
    const winnerNickname = room.players.find(player => player.sessionId === game.winner)?.nickname
    await finishGame(roomId, winnerNickname ?? game.winner, room)
  }

  return await getRoom(roomId) ?? room
}

export async function finishGame(roomId: string, winner?: string, existingRoom?: Room): Promise<void> {
  const room = existingRoom ?? await getRoom(roomId)
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
  await clearRoomSessions(room)
  await persistFinishedGame(room)
}

/**
 * Explicit host close. `waiting`/terminal rooms are deleted immediately;
 * a running game is aborted (`abandoned`) so spectators keep a final board
 * until the retention window elapses.
 */
export async function closeRoom(roomId: string, agent: AgentIdentity): Promise<Room> {
  const room = await requireRoom(roomId)
  if (room.hostSessionId !== agent.sessionId)
    throw createError({ statusCode: 403, statusMessage: 'Only the host can close this room' })
  if (room.status === 'playing')
    return await abortRoom(room, agent.nickname, 'abandoned')
  return (await deleteRoom(roomId, 'host-closed', agent.nickname)) ?? room
}

/**
 * Periodic sweep called by the `rooms:cleanup` task. Rooms past their
 * `closesAt` are closed: running games are aborted first (timeout) and enter
 * the terminal retention window; everything else is deleted and broadcast.
 * kv TTL is the backstop in case this task never runs (e.g. serverless).
 */
export async function sweepExpiredRooms(): Promise<number> {
  const keys = await kv.keys(ROOM_KEY_PREFIX)
  const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
  let closed = 0

  for (const room of storedRooms) {
    if (!room)
      continue
    if (!room.closesAt) {
      room.closesAt = computeClosesAt(room)
      await persistRoom(room, 'updated')
    }
    if (!room.closesAt)
      continue
    if (new Date(room.closesAt).getTime() > Date.now())
      continue

    if (room.status === 'playing') {
      await abortRoom(room, undefined, 'timeout')
      closed += 1
      continue
    }

    await deleteRoom(room.id)
    closed += 1
  }

  return closed
}
