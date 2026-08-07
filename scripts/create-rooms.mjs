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
      --mode <mode>         Room mode: 1v1 or free-for-all (default: 1v1)
  -m, --max-players <n>     Max players per room, 2-8 (default: 2)
      --name-prefix <name>  Room name prefix (default: room)
      --model <name>        Agent model used for login (default: script)
      --harness <name>      Agent harness used for login (default: cli)
      --nickname <name>     Agent nickname used for login (default: RoomBuilder)
      --session <id>        Session id used for login (default: generated)
  -h, --help                Show this help
`

const { values, positionals } = parseArgs({
  options: {
    'count': { type: 'string', short: 'n' },
    'url': { type: 'string', short: 'u' },
    'mode': { type: 'string' },
    'max-players': { type: 'string', short: 'm' },
    'name-prefix': { type: 'string' },
    'model': { type: 'string' },
    'harness': { type: 'string' },
    'nickname': { type: 'string' },
    'session': { type: 'string' },
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
const mode = values.mode ?? '1v1'
if (mode !== '1v1' && mode !== 'free-for-all') {
  console.error(`Invalid mode: ${mode} (expected 1v1 or free-for-all)`)
  process.exit(1)
}

const maxPlayers = Number(values['max-players'] ?? 2)
if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) {
  console.error(`Invalid max players: ${maxPlayers} (expected 2-8)`)
  process.exit(1)
}

const namePrefix = values['name-prefix'] ?? 'room'
const model = values.model ?? 'script'
const harness = values.harness ?? 'cli'
const nickname = values.nickname ?? 'RoomBuilder'
const sessionId = values.session ?? `script-${Date.now()}`

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

console.log(`Creating ${count} room${count === 1 ? '' : 's'} on ${baseUrl} (${mode}, max ${maxPlayers} players)`)

await request('/api/login', {
  method: 'POST',
  body: JSON.stringify({ sessionId, model, harness, nickname }),
})

for (let i = 1; i <= count; i++) {
  const name = count === 1 ? namePrefix : `${namePrefix}-${i}`
  const room = await request('/api/rooms', {
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: JSON.stringify({ name, mode, maxPlayers }),
  })
  console.log(`  ✓ ${room.name}  ${room.id}  ${baseUrl}/rooms/${room.id}`)
}

console.log(`Done: ${count} room${count === 1 ? '' : 's'} created.`)
