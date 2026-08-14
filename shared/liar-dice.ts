// @unocss-include

import type { GameActionRecord } from './game'
import type { GameDefinition, GameSide } from './games'

export const LIAR_DICE_PER_PLAYER = 5
/** Dice showing 1 count toward every bid face (wild). */
export const LIAR_DICE_WILD = 1
export const LIAR_DICE_MIN_FACE = 2
export const LIAR_DICE_MAX_FACE = 6
/** Defensive cap: each call removes one die, so a real match stays far below this. */
export const LIAR_DICE_MAX_ACTIONS = 500

export interface LiarDiceAction extends GameActionRecord {
  type: 'bid' | 'call'
  /** Bid count: how many dice of `face` (wild 1s included) across both hands. */
  count?: number
  /** Bid face, 2-6. */
  face?: number
  /** Optional agent-provided explanation shown to spectators. */
  reason?: string
}

export interface LiarDiceBid {
  playerId: string
  count: number
  face: number
  /** Round this bid belongs to (1-based). */
  round: number
}

export interface LiarDiceRound {
  /** Round number, 1-based, matching `LiarDiceState.roundNumber`. */
  roundNumber: number
  /** Session id of the player who opens the bidding this round. */
  opener: string
  /** Session id -> rolled dice values (1-6). Hidden from opponents. */
  rolls: Record<string, number[]>
  /** Bids made this round so far, in order. */
  bids: LiarDiceBid[]
  /** Result of the call that closed this round; absent while the round is open. */
  call?: LiarDiceCallResult
}

export interface LiarDiceCallResult {
  /** Round this call concluded (1-based). */
  round: number
  callerId: string
  bidderId: string
  count: number
  face: number
  /** Actual dice showing `face` or a wild 1 across both hands. */
  total: number
  /** True when the bid held (total >= count), so the caller loses a die. */
  correct: boolean
  loserId: string
}

export interface LiarDiceState {
  /** Current round number, starting at 1. */
  roundNumber: number
  /** Session id -> dice remaining. Public: the table always shows how many dice each player has left. */
  diceLeft: Record<string, number>
  /** Every round in play order; the last entry is the current/final round. */
  rounds: LiarDiceRound[]
  /** Current round with its rolls; null before the game starts. */
  round: LiarDiceRound | null
  /** Latest bid that must be raised or called; null at the start of a round. */
  currentBid: LiarDiceBid | null
  /** Outcome of the most recent call; the dice are revealed publicly once a call happens. */
  lastCall?: LiarDiceCallResult
  /** Human label of the latest action, e.g. `3×4` or `call`. */
  lastMoveLabel?: string
}

const LIAR_DICE_BID_PATTERN = /^([1-9]|10)[x×]([2-6])$/i
const LIAR_DICE_CALL_PATTERN = /^(?:call|开)$/i

/**
 * Parse Liar's Dice notation: a bid such as `3x4` / `3×4` (count 1-10, face
 * 2-6, case-insensitive) or a call such as `call` / `开`. Returns the raw
 * action, or `null` when the notation is invalid.
 */
export function parseLiarDiceMove(move: string): LiarDiceAction | null {
  const trimmed = move.trim()
  if (LIAR_DICE_CALL_PATTERN.test(trimmed))
    return { type: 'call' }
  const match = LIAR_DICE_BID_PATTERN.exec(trimmed)
  if (!match)
    return null
  return { type: 'bid', count: Number(match[1]), face: Number(match[2]) }
}

/** Human label of a Liar's Dice action, e.g. `3×4` or `call`. */
export function liarDiceMoveLabel(action: { type: 'bid' | 'call', count?: number, face?: number }): string {
  return action.type === 'bid' ? `${action.count}×${action.face}` : 'call'
}

interface LiarDiceBoardPlayer {
  sessionId: string
  slot: string
}

/**
 * Render the table as plain ASCII for MCP clients. The dice of a hand are only
 * shown when `viewerId` belongs to that hand: players see their own dice and
 * the opponent's as `?`, spectators (no viewer) see none, since the web UI is
 * the place where humans watch everything. Public facts (dice left, round,
 * current bid, last call) are always rendered. `status` keeps the board honest
 * once the match ends: no "your turn" hints, just a final result line.
 */
export function renderLiarDiceBoard(
  state: LiarDiceState,
  players: LiarDiceBoardPlayer[],
  viewerId?: string,
  status: 'waiting' | 'playing' | 'finished' | 'aborted' = 'playing',
): string {
  const lines: string[] = []
  const terminal = status === 'finished' || status === 'aborted'
  const roundLabel = state.round ? `Round ${state.roundNumber}` : 'Waiting'
  const left = players
    .map((player) => {
      const name = player.sessionId === viewerId ? 'You' : `Agent ${players.indexOf(player) + 1}`
      return `${name}: ${state.diceLeft[player.sessionId] ?? 0}`
    })
    .join(' · ')
  lines.push(`${roundLabel} · Dice left ${left}`)

  for (const player of players) {
    const name = player.sessionId === viewerId ? 'You' : `Agent ${players.indexOf(player) + 1}`
    const hand = state.round?.rolls[player.sessionId] ?? []
    const shown = player.sessionId === viewerId
      ? `[${hand.join(' ')}]`
      : `[${Array.from({ length: hand.length }).fill('?').join(' ')}]`
    lines.push(`${name}: ${shown}`)
  }

  if (state.currentBid) {
    const bidder = state.currentBid.playerId === viewerId
      ? 'You'
      : `Agent ${players.findIndex(player => player.sessionId === state.currentBid?.playerId) + 1}`
    const isMyTurn = state.currentBid.playerId !== viewerId
    lines.push(`Bid: ${state.currentBid.count}×${state.currentBid.face} (${bidder})${isMyTurn && !terminal ? ' · your turn to raise or call' : ''}`)
  }
  else if (state.round && !terminal) {
    const opener = state.round.opener === viewerId ? 'You' : `Agent ${players.findIndex(player => player.sessionId === state.round?.opener) + 1}`
    lines.push(`${opener} opens the bidding`)
  }

  if (state.lastCall) {
    const loser = state.lastCall.loserId === viewerId ? 'You' : `Agent ${players.findIndex(player => player.sessionId === state.lastCall?.loserId) + 1}`
    lines.push(`Last call: ${state.lastCall.count}×${state.lastCall.face} — total ${state.lastCall.total}, ${state.lastCall.correct ? 'held' : 'bluff'} — ${loser} loses a die`)
  }

  if (status === 'finished')
    lines.push('Match ended')
  else if (status === 'aborted')
    lines.push('Match aborted')

  if (!viewerId)
    lines.push('Spectators: watch the room on the web to see every hand')

  return lines.join('\n')
}

const liarDiceSides: GameSide[] = [
  {
    key: 'one',
    label: 'Agent 1',
    color: 'primary',
    surfaceClass: 'bg-primary-500/10 dark:bg-primary-400/10',
    dotClass: 'bg-primary-500 ring-1 ring-primary-500/40',
    avatarClass: 'side-avatar-one',
  },
  {
    key: 'two',
    label: 'Agent 2',
    color: 'primary',
    surfaceClass: 'bg-primary-500/10 dark:bg-primary-400/10',
    dotClass: 'bg-primary-500 ring-1 ring-primary-500/40',
    avatarClass: 'side-avatar-two',
  },
]

/**
 * Liar's Dice platform definition. Two agents roll five dice each, bid on how
 * many dice show a face (1s are wild), raise or call the bidder, and the loser
 * of each challenge loses a die. Hidden hands make this the platform's first
 * imperfect-information game: MCP surfaces only show your own dice.
 */
export const liarDiceDefinition = {
  id: 'liar-dice',
  name: 'Liar\'s Dice',
  description: 'Bluff with dice: bid on how many dice show a face (1s are wild), raise or call the bidder. Every lost challenge costs a die; first to lose all five loses the match.',
  sides: liarDiceSides,
  minPlayers: 2,
  maxPlayers: 2,
  turnBased: true,
  icon: 'i-carbon-shuffle',
} as const satisfies GameDefinition
