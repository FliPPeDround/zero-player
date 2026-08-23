#!/usr/bin/env node

import process from 'node:process'
import { parseArgs } from 'node:util'

const HELP = `
Create rooms on a running Zero Player server.

Usage:
  node scripts/create-rooms.mjs [count] [options]

Arguments:
  count                     Number of rooms to create (default: 5)

Options:
  -n, --count <n>           Number of rooms to create (default: 5)
  -u, --url <url>           Server base URL (default: http://localhost:3000)
      --game <id>           Game id (default: first game from /api/games)
      --moves <n>           Moves to simulate after the game starts (1-2, default: 2)
      --name-prefix <name>  Room name prefix (default: room)
      --model <name>        Agent model used for login (default: script)
      --harness <name>      Agent harness used for login (default: cli)
      --nickname <name>     Agent nickname used for login (default: RoomBuilder)
  -h, --help                Show this help
`

const { values, positionals } = parseArgs({
  options: {
    'count': { type: 'string', short: 'n' },
    'url': { type: 'string', short: 'u' },
    'game': { type: 'string' },
    'moves': { type: 'string' },
    'name-prefix': { type: 'string' },
    'model': { type: 'string' },
    'harness': { type: 'string' },
    'nickname': { type: 'string' },
    'help': { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

const positionalCount = positionals[0]
const rawCount = positionalCount ?? values.count ?? 5
const count = Number(rawCount)
if (!Number.isInteger(count) || count < 1) {
  console.error(`Invalid room count: ${rawCount}`)
  process.exit(1)
}

const rawMoves = values.moves ?? '2'
const moves = Number(rawMoves)
if (!Number.isInteger(moves) || moves < 1 || moves > 2) {
  console.error(`Invalid moves count: ${rawMoves} (expected 1 or 2)`)
  process.exit(1)
}

const baseUrl = (values.url ?? 'http://localhost:3000').replace(/\/+$/, '')
const namePrefix = values['name-prefix'] ?? 'room'
const model = values.model ?? 'script'
const harness = values.harness ?? 'cli'
const hostNickname = values.nickname ?? 'RoomBuilder'
const guestNickname = `${hostNickname}Guest`
const GOMOKU_MOVE_PATTERN = /^([A-O])([1-9]|1[0-5])$/

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  }
  catch {
    body = text
  }
  if (!response.ok) {
    const message = body?.message ?? body?.statusMessage ?? response.statusText ?? text
    throw new Error(`${response.status} ${message}`)
  }
  return body
}

/**
 * Standard REST login: creates an anonymous identity and returns a short
 * opaque token. Each call gets a fresh identity, since one identity can only
 * host one active room.
 */
async function loginToken(nickname = 'RoomBuilder') {
  const { token } = await request('/api/agent/login', {
    method: 'POST',
    body: JSON.stringify({ nickname, model, harness }),
  })
  return token
}

const games = await request('/api/games')
const gameId = values.game ?? games[0]?.id
if (!gameId) {
  console.error('No games available; cannot create rooms.')
  process.exit(1)
}

console.log(`Creating ${count} room${count === 1 ? '' : 's'} on ${baseUrl} (game: ${gameId}, moves: ${moves})`)

for (let i = 1; i <= count; i++) {
  const name = count === 1 ? namePrefix : `${namePrefix}-${i}`
  const hostToken = await loginToken(hostNickname)
  const guestToken = await loginToken(guestNickname)
  const room = await request('/api/rooms', {
    method: 'POST',
    headers: { authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ name, gameId }),
  })
  await request(`/api/rooms/${room.id}/join`, {
    method: 'POST',
    headers: { authorization: `Bearer ${guestToken}` },
  })
  // start marks the caller ready; the game only begins once every seated
  // player has called it, so both the host and the guest must start.
  await request(`/api/rooms/${room.id}/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hostToken}` },
  })
  await request(`/api/rooms/${room.id}/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${guestToken}` },
  })
  const performed = await simulateMoves(room.id, hostToken, guestToken, gameId, moves)
  console.log(`  ✓ ${room.name}  ${room.id}  ${baseUrl}/rooms/${room.id}  (${performed} simulated moves)`)
}

console.log(`Done: ${count} room${count === 1 ? '' : 's'} created with ${moves} simulated move${moves === 1 ? '' : 's'}.`)

async function simulateMoves(roomId, hostToken, guestToken, gameId, moveCount) {
  const room = await request(`/api/rooms/${roomId}`)
  if (room.status !== 'playing')
    throw new Error(`Room ${roomId} did not start (status: ${room.status})`)

  if (gameId === 'gomoku') {
    const movesToPlay = ['H8', 'H7'].slice(0, moveCount)
    for (let index = 0; index < movesToPlay.length; index++) {
      const move = movesToPlay[index]
      const token = index % 2 === 0 ? hostToken : guestToken
      await request(`/api/rooms/${roomId}/moves`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'place',
          ...parseGomokuMove(move),
          reason: `Script smoke move ${index + 1}`,
        }),
      })
    }
    return movesToPlay.length
  }

  if (gameId === '24-point') {
    let state = room.game.state
    const hostSession = room.players.find(player => player.slot === 'one')?.sessionId
    const guestSession = room.players.find(player => player.slot === 'two')?.sessionId
    if (!hostSession || !guestSession)
      throw new Error(`Room ${roomId} is missing one of the two 24 Point seats`)

    for (let index = 0; index < moveCount; index++) {
      const token = index % 2 === 0 ? hostToken : guestToken
      const sessionId = token === hostToken ? hostSession : guestSession
      const solved = state.progress[sessionId] ?? 0
      const puzzle = state.puzzles[solved]
      const expression = solveTwentyFour(puzzle)
      const updated = await request(`/api/rooms/${roomId}/moves`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'answer',
          expression,
          reason: `Script smoke answer ${index + 1}`,
        }),
      })
      state = updated.game.state
    }
    return moveCount
  }

  if (gameId === 'liar-dice') {
    const movesToPlay = ['2x3', 'call'].slice(0, moveCount)
    for (let index = 0; index < movesToPlay.length; index++) {
      const move = movesToPlay[index]
      const token = index % 2 === 0 ? hostToken : guestToken
      await request(`/api/rooms/${roomId}/moves`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(move === 'call'
          ? { type: 'call', reason: `Script smoke call ${index + 1}` }
          : { type: 'bid', count: Number(move[0]), face: Number(move[2]), reason: `Script smoke bid ${index + 1}` }),
      })
    }
    return movesToPlay.length
  }

  throw new Error(`No move simulation strategy for game: ${gameId}`)
}

function parseGomokuMove(move) {
  const match = GOMOKU_MOVE_PATTERN.exec(move)
  if (!match)
    throw new Error(`Invalid Gomoku move: ${move}`)
  return {
    x: match[1].charCodeAt(0) - 65,
    y: Number(match[2]) - 1,
  }
}

function solveTwentyFour(numbers) {
  const search = (values) => {
    if (values.length === 1)
      return Math.abs(values[0].value - 24) < 1e-9 ? values[0].expression : null

    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i]
        const b = values[j]
        const rest = values.filter((_, index) => index !== i && index !== j)
        const combinations = [
          { value: a.value + b.value, expression: `(${a.expression}+${b.expression})` },
          { value: a.value - b.value, expression: `(${a.expression}-${b.expression})` },
          { value: b.value - a.value, expression: `(${b.expression}-${a.expression})` },
          { value: a.value * b.value, expression: `(${a.expression}*${b.expression})` },
          { value: b.value !== 0 ? a.value / b.value : Number.NaN, expression: `(${a.expression}/${b.expression})` },
          { value: a.value !== 0 ? b.value / a.value : Number.NaN, expression: `(${b.expression}/${a.expression})` },
        ]
        for (const combination of combinations) {
          if (!Number.isFinite(combination.value))
            continue
          const found = search([...rest, combination])
          if (found)
            return found
        }
      }
    }
    return null
  }

  const expression = search(numbers.map(number => ({
    value: number,
    expression: String(number),
  })))
  if (!expression)
    throw new Error(`No 24 Point solution found for: ${numbers.join(', ')}`)
  return expression
}
