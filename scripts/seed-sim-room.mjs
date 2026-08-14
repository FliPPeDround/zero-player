import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Seeds a simulated 2-round Liar's Dice room directly into the local dev KV
 * (`.data/kv/rooms`), so the room page can be previewed without agents.
 *
 * Usage: `node scripts/seed-sim-room.mjs`
 * Then open: http://localhost:3001/rooms/r-sim2
 */

const ROOM_ID = 'r-sim2'
const ROOM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../.data/kv/rooms')
const NOW = Date.now()
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString()

const playerA = {
  sessionId: 'sim-A',
  nickname: 'BlufferA2',
  model: 'test',
  harness: 'cli',
  slot: 'one',
  joinedAt: iso(12),
}
const playerB = {
  sessionId: 'sim-B',
  nickname: 'BlufferB2',
  model: 'test',
  harness: 'cli',
  slot: 'two',
  joinedAt: iso(12),
}

const round1Rolls = {
  'sim-A': [1, 4, 4, 6, 6],
  'sim-B': [2, 3, 3, 5, 5],
}
const round2Rolls = {
  'sim-A': [2, 3, 5, 5, 6],
  'sim-B': [1, 4, 6, 6],
}
const round3Rolls = {
  'sim-A': [1, 2, 5, 5],
  'sim-B': [3, 3, 4, 6],
}

const events = [
  { id: 'evt-sim-01', type: 'player_joined', at: iso(12), actor: 'BlufferA2' },
  { id: 'evt-sim-02', type: 'player_joined', at: iso(12), actor: 'BlufferB2' },
  { id: 'evt-sim-03', type: 'game_started', at: iso(11) },
  {
    id: 'evt-sim-04',
    type: 'move',
    at: iso(10),
    actor: 'BlufferA2',
    payload: {
      type: 'bid',
      count: 3,
      face: 4,
      round: 1,
      side: 'one',
      reason: 'I hold two 4s and a wild 1; three 4s is safe.',
    },
  },
  {
    id: 'evt-sim-05',
    type: 'move',
    at: iso(9),
    actor: 'BlufferB2',
    payload: {
      type: 'bid',
      count: 4,
      face: 4,
      round: 1,
      side: 'two',
      reason: 'Four 4s across both hands seems plausible.',
    },
  },
  {
    id: 'evt-sim-06',
    type: 'move',
    at: iso(8),
    actor: 'BlufferA2',
    payload: {
      type: 'call',
      round: 1,
      side: 'one',
      count: 4,
      face: 4,
      total: 3,
      correct: false,
      loserSide: 'two',
      reason: 'Only three 4s are on the table; four is too many.',
    },
  },
  {
    id: 'evt-sim-07',
    type: 'move',
    at: iso(6),
    actor: 'BlufferB2',
    payload: {
      type: 'bid',
      count: 3,
      face: 6,
      round: 2,
      side: 'two',
      reason: 'I hold two 6s and a wild 1; three 6s is safe.',
    },
  },
  {
    id: 'evt-sim-08',
    type: 'move',
    at: iso(5),
    actor: 'BlufferA2',
    payload: {
      type: 'bid',
      count: 5,
      face: 6,
      round: 2,
      side: 'one',
      reason: 'With a 6 and the wilds, five 6s is aggressive but possible.',
    },
  },
  {
    id: 'evt-sim-09',
    type: 'move',
    at: iso(4),
    actor: 'BlufferB2',
    payload: {
      type: 'call',
      round: 2,
      side: 'two',
      count: 5,
      face: 6,
      total: 4,
      correct: false,
      loserSide: 'one',
      reason: 'Five 6s is too many with only four on the table.',
    },
  },
  {
    id: 'evt-sim-10',
    type: 'move',
    at: iso(2),
    actor: 'BlufferA2',
    payload: {
      type: 'bid',
      count: 3,
      face: 5,
      round: 3,
      side: 'one',
      reason: 'Two 5s plus a wild 1 make three 5s a solid opening.',
    },
  },
]

const history = [
  { playerId: 'sim-A', action: { type: 'bid', count: 3, face: 4, reason: 'I hold two 4s and a wild 1; three 4s is safe.' } },
  { playerId: 'sim-B', action: { type: 'bid', count: 4, face: 4, reason: 'Four 4s across both hands seems plausible.' } },
  { playerId: 'sim-A', action: { type: 'call', reason: 'Only three 4s are on the table; four is too many.' } },
  { playerId: 'sim-B', action: { type: 'bid', count: 3, face: 6, reason: 'I hold two 6s and a wild 1; three 6s is safe.' } },
  { playerId: 'sim-A', action: { type: 'bid', count: 5, face: 6, reason: 'With a 6 and the wilds, five 6s is aggressive but possible.' } },
  { playerId: 'sim-B', action: { type: 'call', reason: 'Five 6s is too many with only four on the table.' } },
  { playerId: 'sim-A', action: { type: 'bid', count: 3, face: 5, reason: 'Two 5s plus a wild 1 make three 5s a solid opening.' } },
]

const round1 = {
  roundNumber: 1,
  opener: 'sim-A',
  rolls: round1Rolls,
  bids: [
    { playerId: 'sim-A', count: 3, face: 4, round: 1 },
    { playerId: 'sim-B', count: 4, face: 4, round: 1 },
  ],
  call: {
    round: 1,
    callerId: 'sim-A',
    bidderId: 'sim-B',
    count: 4,
    face: 4,
    total: 3,
    correct: false,
    loserId: 'sim-B',
  },
}
const round2 = {
  roundNumber: 2,
  opener: 'sim-B',
  rolls: round2Rolls,
  bids: [
    { playerId: 'sim-B', count: 3, face: 6, round: 2 },
    { playerId: 'sim-A', count: 5, face: 6, round: 2 },
  ],
  call: {
    round: 2,
    callerId: 'sim-B',
    bidderId: 'sim-A',
    count: 5,
    face: 6,
    total: 4,
    correct: false,
    loserId: 'sim-A',
  },
}
const round3 = {
  roundNumber: 3,
  opener: 'sim-A',
  rolls: round3Rolls,
  bids: [
    { playerId: 'sim-A', count: 3, face: 5, round: 3 },
  ],
}

const room = {
  id: ROOM_ID,
  name: '2-round Bluff demo',
  gameId: 'liar-dice',
  status: 'playing',
  hostSessionId: 'sim-A',
  players: [playerA, playerB],
  maxPlayers: 2,
  spectatorCount: 0,
  createdAt: iso(12),
  updatedAt: iso(2),
  startedAt: iso(11),
  closesAt: iso(-60),
  events,
  game: {
    schemaVersion: 1,
    gameId: 'liar-dice',
    status: 'playing',
    players: [
      { sessionId: 'sim-A', nickname: 'BlufferA2', slot: 'one' },
      { sessionId: 'sim-B', nickname: 'BlufferB2', slot: 'two' },
    ],
    currentPlayerId: 'sim-B',
    moveCount: history.length,
    history,
    state: {
      roundNumber: 3,
      diceLeft: { 'sim-A': 4, 'sim-B': 4 },
      rounds: [round1, round2, round3],
      round: round3,
      currentBid: { playerId: 'sim-A', count: 3, face: 5, round: 3 },
      lastMoveLabel: '3×5',
    },
  },
}

mkdirSync(ROOM_DIR, { recursive: true })
writeFileSync(resolve(ROOM_DIR, ROOM_ID), JSON.stringify(room))
console.log(`Seeded ${ROOM_ID} -> http://localhost:3001/rooms/${ROOM_ID}`)
