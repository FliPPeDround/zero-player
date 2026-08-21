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

type ListListener = (message: RoomListSocketMessage) => void
type DetailListener = (message: RoomDetailSocketMessage) => void

const ROOM_KEY_PREFIX = 'rooms:'
const SESSION_KEY_PREFIX = 'session:'
const SESSION_INDEX_TTL_SECONDS = 60 * 60 * 24 * 7
const ROOM_LIST_CACHE_TTL_MS = 10_000
const listListeners = new Set<ListListener>()
const detailListeners = new Map<string, Set<DetailListener>>()
const spectatorCounts = new Map<string, number>()
const gameMoveQueues = new Map<string, Promise<unknown>>()
let roomListCache: { rooms: RoomSummary[], builtAt: number } | null = null

const WAITING_IDLE_MS = envMs('ROOMS_WAITING_IDLE_MS', 60 * 60 * 1000)
const STALL_TIMEOUT_MS = envMs('ROOMS_STALL_TIMEOUT_MS', 60 * 60 * 1000)
const TERMINAL_RETENTION_MS = envMs('ROOMS_TERMINAL_RETENTION_MS', 10 * 60 * 1000)
/**
 * How long a running room stays `playing` after a player leaves before it is
 * aborted as abandoned. The leaver can rejoin during this window to cancel
 * the pending abandonment (an accidental AI leave is not instantly terminal).
 */
const LEAVE_GRACE_MS = envMs('ROOMS_LEAVE_GRACE_MS', 5 * 60 * 1000)
const KV_TTL_MAX_SECONDS = 60 * 60 * 24 * 7

let eventCounter = 0

type RoomUpdateListMessage
  = { type: 'created' | 'updated', room: RoomSummary }
    | { type: 'deleted', room: RoomSummary }

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
    : { type, room: summary }
  updateRoomListCache(type, summary)
  for (const listener of listListeners)
    listener(message)
  return message
}

/**
 * Keep the in-process lobby cache in sync with the update feed. The cache is
 * only a read-avoidance layer: it expires after a few seconds, so a cold
 * reload picks up the next full KV scan.
 */
function updateRoomListCache(type: 'created' | 'updated' | 'deleted', room: RoomSummary): void {
  if (!roomListCache)
    return
  if (type === 'deleted') {
    roomListCache.rooms = roomListCache.rooms.filter(item => item.id !== room.id)
  }
  else {
    const index = roomListCache.rooms.findIndex(item => item.id === room.id)
    if (index === -1)
      roomListCache.rooms.unshift(room)
    else
      roomListCache.rooms[index] = room
  }
  roomListCache.rooms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function emitDetail(roomId: string, message: RoomDetailSocketMessage): RoomDetailSocketMessage {
  const listeners = detailListeners.get(roomId)
  if (!listeners)
    return message
  for (const listener of listeners)
    listener(message)
  return message
}

/**
 * Legacy rooms stored players with hardcoded `red`/`blue` slots. Now slots are
 * game side keys (e.g. `black`/`white` for Gomoku), so remap players by join
 * order whenever the stored slots no longer match the game definition.
 */
function normalizeRoomSides(room: Room): void {
  if (!Array.isArray(room.readySessionIds))
    room.readySessionIds = []
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
    if (room.status === 'finished')
      return new Date(room.finishedAt ?? room.updatedAt).getTime() + TERMINAL_RETENTION_MS
    if (room.status === 'aborted')
      return new Date(room.abortedAt ?? room.updatedAt).getTime() + TERMINAL_RETENTION_MS
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
  room.spectatorCount = spectatorCounts.get(room.id) ?? room.spectatorCount
  const ttl = ttlSecondsUntil(room)
  await kv.set(roomKey(room.id), room, ttl ? { ttl } : undefined)
  emitList(type, room)
  emitDetail(room.id, { type: 'update', room })
}

async function deleteRoom(roomId: string, reason = 'closed', by?: string): Promise<Room | null> {
  const room = await getRoom(roomId)
  if (!room)
    return null
  appendEvent(room, 'room_closed', by, { reason })
  await kv.del(roomKey(roomId))
  spectatorCounts.delete(roomId)
  await clearRoomSessions(room)
  emitList('deleted', room)
  emitDetail(roomId, { type: 'closed', room })
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
    readySessionIds: [],
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

  const cached = roomListCache && Date.now() - roomListCache.builtAt < ROOM_LIST_CACHE_TTL_MS
    ? roomListCache.rooms
    : null

  let summaries: RoomSummary[]
  if (cached) {
    summaries = cached
  }
  else {
    const keys = await kv.keys(ROOM_KEY_PREFIX)
    const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
    const rooms = storedRooms.filter((room): room is Room => room !== null)
    rooms.forEach((room) => {
      normalizeRoomSides(room)
      room.spectatorCount = spectatorCounts.get(room.id) ?? room.spectatorCount
    })
    summaries = rooms
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toRoomSummary)
    roomListCache = { rooms: summaries, builtAt: Date.now() }
  }

  return summaries
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
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const room = await kv.get<Room>(roomKey(roomId))
  if (room) {
    normalizeRoomSides(room)
    room.spectatorCount = spectatorCounts.get(roomId) ?? room.spectatorCount
    // Snapshots created before round history existed only kept the current
    // round. Hydrate once so the web timeline can render every round.
    if (room.gameId === 'liar-dice' && room.game) {
      const state = room.game.state as { rounds?: unknown } | undefined
      if (state && typeof state === 'object' && !Array.isArray(state.rounds))
        room.game = createGameInstance(room).snapshot()
    }
  }
  return room
}

/**
 * Read only the session→room index. Callers that need the room itself (or an
 * active-room guarantee) should use `findActiveRoomForSession` instead; MCP
 * move/lookup flows use this to avoid loading the whole room twice.
 */
export async function getSessionRoomId(sessionId: string): Promise<string | null> {
  return await kv.get<string>(sessionKey(sessionId))
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

  const isAlreadyPlayer = room.players.some(player => player.sessionId === agent.sessionId)
  const mayResume = room.status === 'playing'
    && isAlreadyPlayer
    && room.pendingLeaveSessionId === agent.sessionId
    && typeof room.pendingLeaveAt === 'string'
    && new Date(room.pendingLeaveAt).getTime() > Date.now()

  if (room.status !== 'waiting' && !mayResume)
    throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}; it is no longer accepting players` })

  if (isAlreadyPlayer) {
    await setSessionRoom(agent.sessionId, room.id)
    if (mayResume) {
      // The leaver is back inside the grace window: cancel the pending
      // abandonment and resume the match where it left off.
      room.pendingLeaveAt = undefined
      room.pendingLeaveSessionId = undefined
      appendEvent(room, 'player_joined', agent.nickname, { resumed: true })
      await persistRoom(room, 'updated')
    }
    return room
  }

  if (room.players.length >= room.maxPlayers)
    throw createError({ statusCode: 409, statusMessage: 'Room is full' })

  addPlayer(room, agent)

  // The room stays `waiting` once full; any player must explicitly call
  // `startRoom` (via the start-game MCP tool / REST route) to begin the match.
  await persistRoom(room, 'updated')

  await setSessionRoom(agent.sessionId, room.id)
  return room
}

/**
 * Explicit player-ready signal. Calling this marks the caller as ready, and
 * the game starts only once every seated player has called it. A player may
 * only become ready when the room is full — otherwise a race game such as
 * 24 Point would let the early caller's personal clock run while the other
 * player has not even joined, which defeats the fairness `start-game`
 * exists to provide. The timestamp of each player's call is recorded in
 * `room.readyAt` so race games can clock each player from their own start.
 */
export async function startRoom(roomId: string, agent: AgentIdentity): Promise<Room> {
  const room = await requireRoom(roomId)

  if (!room.players.some(player => player.sessionId === agent.sessionId))
    throw createError({ statusCode: 403, statusMessage: 'You are not a player in this room' })

  if (room.status === 'playing')
    return room

  if (room.status !== 'waiting')
    throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}; it cannot be started` })
  if (room.players.length < room.maxPlayers)
    throw createError({ statusCode: 409, statusMessage: `Room is not full yet (${room.players.length}/${room.maxPlayers}); call start-game after everyone has joined` })

  if (!room.readySessionIds.includes(agent.sessionId)) {
    room.readySessionIds.push(agent.sessionId)
    room.readyAt = {
      ...(room.readyAt ?? {}),
      [agent.sessionId]: new Date().toISOString(),
    }
    const player = room.players.find(candidate => candidate.sessionId === agent.sessionId)
    appendEvent(room, 'player_ready', player?.nickname)
  }

  const allReady = room.players.length >= room.maxPlayers
    && room.players.every(player => room.readySessionIds.includes(player.sessionId))

  if (allReady)
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

  if (room.status === 'playing') {
    // Do not make an accidental leave terminal: keep the match `playing` for a
    // grace period. If the leaver rejoins in time the pending abandonment is
    // cancelled; otherwise the sweep aborts the room as abandoned.
    room.pendingLeaveSessionId = agent.sessionId
    room.pendingLeaveAt = new Date(Date.now() + LEAVE_GRACE_MS).toISOString()
    const leaver = room.players[index]
    appendEvent(room, 'player_left', leaver?.nickname, { pendingAbandon: true, graceMs: LEAVE_GRACE_MS })
    await clearSessionRoom(agent.sessionId)
    await persistRoom(room, 'updated')
    return room
  }

  const [leaver] = room.players.splice(index, 1)
  room.readySessionIds = room.readySessionIds.filter(id => id !== agent.sessionId)
  if (room.readyAt)
    delete room.readyAt[agent.sessionId]
  appendEvent(room, 'player_left', leaver?.nickname)
  if (leaver)
    await clearSessionRoom(leaver.sessionId)

  if (room.hostSessionId === leaver?.sessionId && room.players[0])
    room.hostSessionId = room.players[0].sessionId

  // Readiness only exists while the room is full ("everyone must be present
  // before anyone can be ready"). Once the room drops below full, every
  // remaining player has to call start-game again after it refills.
  if (room.players.length < room.maxPlayers) {
    room.readySessionIds = []
    room.readyAt = undefined
  }

  if (room.players.length === 0) {
    return (await deleteRoom(room.id)) ?? room
  }

  await persistRoom(room, 'updated')
  return room
}

export async function setSpectatorCount(roomId: string, count: number): Promise<void> {
  // Spectator counts are ephemeral UI data, so they deliberately live only in
  // memory; after a restart the count starts at the stored value until the
  // next WS open/close.
  const room = await getRoom(roomId)
  if (!room)
    return
  const normalized = Math.max(0, count)
  if (room.spectatorCount === normalized)
    return
  room.spectatorCount = normalized
  spectatorCounts.set(roomId, normalized)
  emitList('updated', room)
}

/**
 * Authoritative entry point for gameplay. Any player (agent via MCP/API,
 * future human input) submits an action through here; the game engine
 * validates it, the new snapshot is persisted and broadcast, and the room is
 * finished when the engine reports a terminal state.
 */
export function submitGameMove(
  roomId: string,
  playerId: string,
  action: GameActionRecord,
): Promise<Room> {
  return withRoomMoveSerialization(roomId, async () => {
    const room = await requireRoom(roomId)

    if (room.status !== 'playing')
      throw createError({ statusCode: 409, statusMessage: `Room is ${room.status}` })

    if (!room.players.some(player => player.sessionId === playerId))
      throw createError({ statusCode: 403, statusMessage: 'You are not a player in this room' })
    if (room.pendingLeaveSessionId === playerId)
      throw createError({ statusCode: 409, statusMessage: 'You left this room; rejoin it to resume the game' })

    const game = createGameInstance(room)
    const outcome = game.play(playerId, action)
    if (!outcome.ok)
      throw createError({ statusCode: 409, statusMessage: outcome.error })

    room.game = game.snapshot()
    const player = room.players.find(player => player.sessionId === playerId)
    appendEvent(room, 'move', player?.nickname, {
      ...action,
      ...(outcome.details ?? {}),
      ...(player?.slot ? { side: player.slot } : {}),
    })
    await persistRoom(room, 'updated')

    if (game.status === 'finished')
      await finishGame(roomId, game.winner, room)

    return room
  })
}

/**
 * Race games (e.g. 24 Point) let both players submit at the same time. The
 * KV room state is read-modify-write, so submissions are serialized per
 * room.
 */
function withRoomMoveSerialization<T>(roomId: string, task: () => Promise<T>): Promise<T> {
  const previous = gameMoveQueues.get(roomId) ?? Promise.resolve()
  const run = previous.then(task, task)
  gameMoveQueues.set(roomId, run.then(() => undefined, () => undefined))
  return run
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
 * Admin-only immediate close. Unlike `closeRoom`, this removes the room in
 * any state right away (including a running match) instead of aborting it
 * into the terminal retention window. Guarded by the admin password check
 * in the `admin-close` REST endpoint.
 */
export async function adminCloseRoom(roomId: string): Promise<Room | null> {
  return await deleteRoom(roomId, 'admin-closed', 'admin')
}

/**
 * Periodic sweep called by the `rooms:cleanup` task. Rooms past their
 * `closesAt` are closed: running games are aborted first (timeout) and enter
 * the terminal retention window; everything else is deleted and broadcast.
 * The scheduled task is the primary expiry mechanism (fs-lite does not apply
 * TTLs to stored room entries).
 */
export async function sweepExpiredRooms(): Promise<number> {
  const keys = await kv.keys(ROOM_KEY_PREFIX)
  const storedRooms = await Promise.all(keys.map(key => kv.get<Room>(key)))
  let closed = 0

  for (const room of storedRooms) {
    if (!room)
      continue
    // Pending-leave grace window expired: the leaver never came back, so the
    // running match is abandoned.
    if (room.status === 'playing' && room.pendingLeaveAt && new Date(room.pendingLeaveAt).getTime() <= Date.now()) {
      const leaverNickname = room.pendingLeaveSessionId
        ? room.players.find(player => player.sessionId === room.pendingLeaveSessionId)?.nickname
        : undefined
      await abortRoom(room, leaverNickname, 'abandoned')
      closed += 1
      continue
    }
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
