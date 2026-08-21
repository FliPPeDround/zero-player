import type { GamePlayer, GameResult, GameSnapshot, PlayedAction } from '#shared/game'
import type { LiarDiceAction, LiarDiceCallResult, LiarDiceRound, LiarDiceState } from '#shared/liar-dice'
import type { GameMcpMoveDefinition } from './BaseGame'
import {
  LIAR_DICE_BID_PATTERN,
  LIAR_DICE_MAX_ACTIONS,
  LIAR_DICE_MAX_FACE,
  LIAR_DICE_MIN_FACE,
  LIAR_DICE_PER_PLAYER,
  LIAR_DICE_WILD,
  liarDiceDefinition,
  liarDiceMoveLabel,
  parseLiarDiceMove,
} from '#shared/liar-dice'
import { z } from 'zod'
import { BaseGame } from './BaseGame'

function rollDice(count: number): number[] {
  const dice: number[] = []
  for (let index = 0; index < count; index++)
    dice.push(1 + Math.floor(Math.random() * 6))
  return dice
}

/** Total dice in play this round: the pool a bid can never exceed. */
function totalDiceInPlay(state: LiarDiceState): number {
  return Object.values(state.diceLeft).reduce((sum, count) => sum + count, 0)
}

/** Count of dice showing `face` or a wild 1 across every hand. */
function countFace(state: LiarDiceState, face: number): number {
  let total = 0
  for (const hand of Object.values(state.round?.rolls ?? {}))
    total += hand.filter(die => die === face || die === LIAR_DICE_WILD).length
  return total
}

/**
 * Liar's Dice (吹牛骰) elimination match. Both players roll five dice, the
 * opener bids on how many dice across both hands show a face (1s are wild),
 * and players must raise the bid or call it. The loser of each challenge loses
 * one die; a player at zero dice loses the match.
 *
 * This is the platform's first hidden-information game, so two rules apply:
 *
 * - The current round's dice values live in `state.round.rolls` and are part
 *   of the snapshot, so restores resume the exact same hands. Rolls are only
 *   generated while playing.
 * - The MCP boundary never serializes `state.round.rolls` back to players;
 *   `server/mcp/utils/room-view.ts` redacts it and renders identity-aware
 *   ASCII boards instead.
 */
export class LiarDiceGame extends BaseGame<LiarDiceAction, LiarDiceState> {
  readonly gameId = liarDiceDefinition.id

  readonly definition = liarDiceDefinition

  static readonly mcpMoveDefinition: GameMcpMoveDefinition = {
    gameId: liarDiceDefinition.id,
    toolName: 'make-liar-dice-move',
    title: 'Make Liar\'s Dice move',
    description: 'Bid or call in Liar\'s Dice. Each player rolls five dice (fewer after losses) and dice showing 1 count as wild. A bid is "count x face", e.g. 3x4 (faces 2–6); the next bid must raise the count or keep it and raise the face. "call" challenges the current bid — whoever is wrong loses a die, and first to zero dice loses the match. Your legal moves this turn are listed in the returned legalMoves — pick one and add a reason for spectators.',
    inputSchema: {
      type: z.enum(['bid', 'raise', 'call'])
        .describe('What to do: `bid` opens a round, `raise` increases the current bid, `call` challenges it.'),
      call: z.string()
        .trim()
        .regex(LIAR_DICE_BID_PATTERN, 'Use bid notation like 3x4 (count 1-10, face 2-6, e.g. 3×4)')
        .optional()
        .describe('The bid in "count x face" notation, e.g. 3x4 — required for `bid` and `raise`, omit for `call`.'),
      reason: z.string()
        .trim()
        .min(1, 'Explain why you chose this move')
        .max(500, 'Keep the reason under 500 characters')
        .describe('Why you bid or called, in 1-2 short sentences (shown to spectators), e.g. "Two 4s and a wild 1 make three 4s likely."'),
    },
    toAction: ({ type, call, reason }) => {
      const kind = String(type ?? '').toLowerCase()
      if (kind === 'call') {
        return {
          type: 'call',
          ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
        }
      }
      if (kind !== 'bid' && kind !== 'raise')
        throw createError({ statusCode: 400, statusMessage: 'type must be bid, raise or call' })
      const notation = typeof call === 'string' ? call.trim() : ''
      const action = parseLiarDiceMove(notation)
      if (!action)
        throw createError({ statusCode: 400, statusMessage: `Invalid bid notation: ${notation || '(empty)'}` })
      return {
        ...action,
        ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
      }
    },
    describeAction: ({ type, call }) => {
      const kind = String(type ?? '').toLowerCase()
      if (kind === 'call')
        return 'Called the bidder'
      return kind === 'raise'
        ? `Raised to ${String(call ?? '')}`
        : `Bid ${String(call ?? '')}`
    },
  }

  createInitialState(): LiarDiceState {
    const diceLeft: Record<string, number> = {}
    for (const player of this.players)
      diceLeft[player.sessionId] = LIAR_DICE_PER_PLAYER
    const round = this.newRound(1, this.players[0]?.sessionId ?? null, diceLeft)
    return {
      roundNumber: 1,
      diceLeft,
      rounds: [round],
      round,
      currentBid: null,
    }
  }

  getCurrentPlayerId(
    state: LiarDiceState,
    _history: PlayedAction<LiarDiceAction>[],
    players: GamePlayer[],
  ): string | null {
    if (!state.round)
      return null
    if (!state.currentBid)
      return state.round.opener
    return players.find(player => player.sessionId !== state.currentBid?.playerId)?.sessionId ?? null
  }

  validateAction(_playerId: string, action: LiarDiceAction): string | null {
    if (action.type === 'call')
      return this.state.currentBid ? null : 'There is no bid to call yet'

    if (action.type !== 'bid')
      return `Unknown action: ${action.type}`

    const { count, face } = action
    if (!Number.isInteger(count) || (count ?? 0) < 1)
      return 'Bid count must be a positive integer'
    if (!Number.isInteger(face) || (face ?? 0) < LIAR_DICE_MIN_FACE || (face ?? 0) > LIAR_DICE_MAX_FACE)
      return `Bid face must be between ${LIAR_DICE_MIN_FACE} and ${LIAR_DICE_MAX_FACE}`

    const total = totalDiceInPlay(this.state)
    if ((count ?? 0) > total)
      return `You cannot bid ${count} dice: only ${total} dice are in play`

    const current = this.state.currentBid
    if (current) {
      if ((count ?? 0) < current.count)
        return 'A new bid must raise the count or the face'
      if ((count ?? 0) === current.count && (face ?? 0) <= current.face)
        return 'A new bid with the same count must raise the face'
    }
    return null
  }

  applyAction(state: LiarDiceState, action: LiarDiceAction, playerId: string): LiarDiceState {
    if (action.type === 'bid') {
      const bid = { playerId, count: action.count ?? 0, face: action.face ?? 0, round: state.roundNumber }
      const rounds = state.rounds.length
        ? state.rounds.map((round, index) => (
            index === state.rounds.length - 1 ? { ...round, bids: [...round.bids, bid] } : round
          ))
        : state.round
          ? [{ ...state.round, roundNumber: state.roundNumber, bids: [...state.round.bids, bid] }]
          : []
      return {
        ...state,
        currentBid: bid,
        round: rounds.at(-1) ?? null,
        rounds,
        lastMoveLabel: liarDiceMoveLabel(action),
      }
    }

    const bid = state.currentBid
    if (!bid)
      return state

    const total = countFace(state, bid.face)
    const correct = total >= bid.count
    const loserId = correct ? playerId : bid.playerId
    const diceLeft = {
      ...state.diceLeft,
      [loserId]: Math.max(0, (state.diceLeft[loserId] ?? 0) - 1),
    }
    const lastCall: LiarDiceCallResult = {
      round: state.roundNumber,
      callerId: playerId,
      bidderId: bid.playerId,
      count: bid.count,
      face: bid.face,
      total,
      correct,
      loserId,
    }
    const rounds = state.rounds.length
      ? state.rounds.map((round, index) => (
          index === state.rounds.length - 1 ? { ...round, call: lastCall } : round
        ))
      : state.round
        ? [{ ...state.round, roundNumber: state.roundNumber, call: lastCall }]
        : []

    if ((diceLeft[loserId] ?? 0) === 0) {
      // The loser is out; keep the final round on the table for the result view.
      return {
        ...state,
        diceLeft,
        rounds,
        round: rounds.at(-1) ?? null,
        lastCall,
        lastMoveLabel: 'call',
      }
    }

    // The round loser opens the next round with their remaining dice.
    const nextRound = this.newRound(state.roundNumber + 1, loserId, diceLeft)
    return {
      ...state,
      roundNumber: state.roundNumber + 1,
      diceLeft,
      rounds: [...rounds, nextRound],
      round: nextRound,
      currentBid: null,
      lastCall,
      lastMoveLabel: 'call',
    }
  }

  getResult(
    state: LiarDiceState,
    history: PlayedAction<LiarDiceAction>[],
    players: GamePlayer[],
  ): GameResult | null {
    if (history.length >= LIAR_DICE_MAX_ACTIONS)
      return { reason: 'too-many-moves', details: { moves: history.length } }

    const loser = players.find(player => (state.diceLeft[player.sessionId] ?? 0) <= 0)
    if (!loser)
      return null
    const winner = players.find(player => player.sessionId !== loser.sessionId)
    return {
      winner: winner?.sessionId,
      reason: 'no-dice',
      details: { loserId: loser.sessionId, finalCall: state.lastCall },
    }
  }

  override getLegalActions(playerId: string): LiarDiceAction[] {
    if (this.currentPlayerId !== playerId)
      return []

    const actions: LiarDiceAction[] = []
    const total = totalDiceInPlay(this.state)
    const current = this.state.currentBid
    for (let count = 1; count <= total; count++) {
      for (let face = LIAR_DICE_MIN_FACE; face <= LIAR_DICE_MAX_FACE; face++) {
        if (current && (count < current.count || (count === current.count && face <= current.face)))
          continue
        actions.push({ type: 'bid', count, face })
      }
    }
    if (current)
      actions.push({ type: 'call' })
    return actions
  }

  protected override getMoveMetadata(playerId: string, action: LiarDiceAction): Record<string, unknown> | undefined {
    if (action.type === 'bid')
      return { round: this.state.roundNumber }
    if (action.type !== 'call')
      return undefined
    const call = this.state.lastCall
    if (!call || call.callerId !== playerId)
      return undefined
    return {
      round: call.round,
      count: call.count,
      face: call.face,
      total: call.total,
      correct: call.correct,
      loserSide: this.players.find(player => player.sessionId === call.loserId)?.slot ?? null,
    }
  }

  override restore(snapshot: GameSnapshot): void {
    super.restore(snapshot)
    const state = this.state as LiarDiceState
    if (!Array.isArray(state.rounds) || state.rounds.length === 0) {
      state.rounds = state.round
        ? [{
            ...state.round,
            roundNumber: state.roundNumber,
            bids: state.round.bids.map(bid => ({ ...bid, round: state.roundNumber })),
            call: state.lastCall ? { ...state.lastCall, round: state.roundNumber } : undefined,
          }]
        : []
      state.round = state.rounds.at(-1) ?? null
    }
  }

  private newRound(roundNumber: number, openerId: string | null | undefined, diceLeft: Record<string, number>): LiarDiceRound {
    const rolls: Record<string, number[]> = {}
    for (const player of this.players) {
      const count = diceLeft[player.sessionId] ?? 0
      if (count > 0)
        rolls[player.sessionId] = rollDice(count)
    }
    return { roundNumber, opener: openerId ?? this.players[0]?.sessionId ?? '', rolls, bids: [] }
  }
}
