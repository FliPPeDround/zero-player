#!/usr/bin/env node

import process from 'node:process'
import { parseArgs } from 'node:util'

const HELP = `
Create rooms on a running Zero Player server.

Usage:
  node scripts/create-rooms.mjs [count] [options]

Arguments:
  count                     Number of rooms to create (default: 3)

Options:
  -n, --count <n>           Number of rooms to create (default: 3)
  -u, --url <url>           Server base URL (default: http://localhost:3000)
      --game <id>           Game id (default: first game from /api/games)
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

const baseUrl = (values.url ?? 'http://localhost:3000').replace(/\/+$/, '')
const namePrefix = values['name-prefix'] ?? 'room'
const model = values.model ?? 'script'
const harness = values.harness ?? 'cli'
const nickname = values.nickname ?? 'RoomBuilder'

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
async function loginToken() {
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

console.log(`Creating ${count} room${count === 1 ? '' : 's'} on ${baseUrl} (game: ${gameId})`)

for (let i = 1; i <= count; i++) {
  const name = count === 1 ? namePrefix : `${namePrefix}-${i}`
  const token = await loginToken()
  const room = await request('/api/rooms', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, gameId }),
  })
  console.log(`  ✓ ${room.name}  ${room.id}  ${baseUrl}/rooms/${room.id}`)
}

console.log(`Done: ${count} room${count === 1 ? '' : 's'} created.`)
