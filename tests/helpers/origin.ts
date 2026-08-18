import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const TRAILING_SLASH = /\/+$/
const LISTENING_PORT = /:(\d+)\s+\(LISTEN\)/
const NITRO_JSON = join(process.cwd(), '.nuxt', 'nitro.json')
const NUXT_LOCK = join(process.cwd(), '.nuxt', 'nuxt.lock')
const FALLBACK_ORIGIN = 'http://localhost:3001'

export interface ResolvedOrigin {
  origin: string
  source: 'env' | 'lock' | 'pid' | 'probe' | 'fallback'
}

/**
 * Resolve the dev server origin at runtime. The vitest process shares the
 * project's `.nuxt/` build directory with the running `nuxt dev` server, so
 * the URL can be derived from what Nuxt itself records instead of being
 * hardcoded:
 *
 * 1. `ZP_ORIGIN` env var (explicit override, highest priority);
 * 2. the Nuxt dev lock file (`.nuxt/nuxt.lock`) when present, which stores
 *    the bound URL;
 * 3. the dev PID recorded in `.nuxt/nitro.json`, mapped back to its listening
 *    port via `lsof`;
 * 4. probing Nuxt's default / previously used ports as a last resort.
 */
export async function resolveOrigin(): Promise<ResolvedOrigin> {
  const explicit = process.env.ZP_ORIGIN
  if (explicit?.trim())
    return { origin: explicit.trim().replace(TRAILING_SLASH, ''), source: 'env' }

  const lockUrl = await readNuxtLockUrl()
  if (lockUrl)
    return { origin: lockUrl, source: 'lock' }

  const pid = await readDevPid()
  if (pid) {
    const port = await findPortOfProcess(pid)
    if (port)
      return { origin: `http://localhost:${port}`, source: 'pid' }
  }

  for (const port of [3000, 3001]) {
    if (await isReachable(port))
      return { origin: `http://localhost:${port}`, source: 'probe' }
  }
  return { origin: FALLBACK_ORIGIN, source: 'fallback' }
}

async function readNuxtLockUrl(): Promise<string | undefined> {
  try {
    const raw = await readFile(NUXT_LOCK, 'utf8')
    const info = JSON.parse(raw) as { url?: string, pid?: number }
    if (typeof info.url !== 'string' || typeof info.pid !== 'number')
      return undefined
    if (!isProcessAlive(info.pid))
      return undefined
    return info.url.replace(TRAILING_SLASH, '')
  }
  catch {
    return undefined
  }
}

async function readDevPid(): Promise<number | undefined> {
  try {
    const raw = await readFile(NITRO_JSON, 'utf8')
    const info = JSON.parse(raw) as { dev?: { pid?: number } }
    return typeof info.dev?.pid === 'number' ? info.dev.pid : undefined
  }
  catch {
    return undefined
  }
}

async function findPortOfProcess(pid: number): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)])
    const match = stdout.match(LISTENING_PORT)
    return match ? Number(match[1]) : undefined
  }
  catch {
    return undefined
  }
}

async function isReachable(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/rooms`, {
      signal: AbortSignal.timeout(1_000),
    })
    return response.ok
  }
  catch {
    return false
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
