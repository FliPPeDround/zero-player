import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

/**
 * Chain state persisted between separate vitest invocations. The Gomoku flow
 * is one match chain (same login tokens, same room, same game); running its
 * steps one by one with `-t` spawns a fresh process each time, so the state
 * is saved here (one file per game) and restored on the next step run. A full
 * test run resets it (via 步骤 0) and always builds a brand-new chain.
 */
export interface ChainState {
  agentAToken: string
  agentBToken: string
  agentANickname: string
  agentBNickname: string
  /** Present once the room has been created. */
  roomId?: string
  updatedAt: string
}

function stateFile(gameId: string): string {
  return join(process.cwd(), '.data', `vitest-chain-${gameId}.json`)
}

export async function loadChainState(gameId: string): Promise<ChainState | null> {
  try {
    const raw = await readFile(stateFile(gameId), 'utf8')
    return JSON.parse(raw) as ChainState
  }
  catch {
    return null
  }
}

export async function saveChainState(
  gameId: string,
  state: Omit<ChainState, 'updatedAt'>,
): Promise<void> {
  const payload: ChainState = { ...state, updatedAt: new Date().toISOString() }
  await writeFile(stateFile(gameId), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function clearChainState(gameId: string): Promise<void> {
  await rm(stateFile(gameId), { force: true })
}
