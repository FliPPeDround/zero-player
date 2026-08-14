import type { TwentyFourState } from '#shared/24-point'
import type { GomokuState } from '#shared/gomoku'
import type { LiarDiceState } from '#shared/liar-dice'
import type { Room } from '#shared/rooms'
import { renderTwentyFourChallenge } from '#shared/24-point'
import { gomokuMoveLabel, renderGomokuBoard } from '#shared/gomoku'
import { renderLiarDiceBoard } from '#shared/liar-dice'
import { createGameInstance } from '../../games/registry'
import { getRoomUrl } from './room-url'

export interface McpGameResult {
  roomId: string
  game: string
  status: Room['status']
  yourSide: string | null
  currentPlayer: 'you' | 'opponent' | null
  /** Number of the move being played; 1 before the game starts. Omitted when terminal. */
  moveNumber?: number
  /** Latest move in human game notation, e.g. H8. */
  lastMove?: string
  board?: string
  /** Race-game challenge summary, e.g. the current 24 Point question. */
  challenge?: string
  /** Current question number for the caller's race game. */
  question?: number
  /** Questions the caller has already solved in a race game. */
  solved?: number
  /** Your current Liar's Dice hand, e.g. `1 3 3 6 6`. The opponent's dice are never exposed. */
  yourDice?: string
  /** Dice remaining per player in Liar's Dice (public table count). */
  diceLeft?: { you: number, opponent: number }
  /** Current Liar's Dice bid in human notation, e.g. `3×4`. */
  currentBid?: string
  /** Current Liar's Dice round number. */
  round?: number
  /** Legal Liar's Dice moves this turn, e.g. `{ type: 'raise', call: '3x4' }` or `{ type: 'call' }`. */
  legalMoves?: Array<{ type: 'bid' | 'raise' | 'call', call?: string }>
  /** Outcome of the most recent Liar's Dice call; dice are public once revealed. */
  lastCall?: { total: number, correct: boolean, youLost: boolean }
  winner?: 'you' | 'opponent' | 'draw'
  reason?: string
}

/** Compact room summary returned by create/join tools; keeps responses small. */
export function toMcpRoomSummary(room: Room): {
  id: string
  name: string
  gameId: string
  status: Room['status']
  playerCount: number
  maxPlayers: number
} {
  return {
    id: room.id,
    name: room.name,
    gameId: room.gameId,
    status: room.status,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
  }
}

/**
 * MCP-facing presentation of a room. At this boundary:
 *
 * - The board is always the ASCII diagram in the `board` field; the raw
 *   coordinate-encoded board inside `game.state` is not exposed.
 * - Per-move explanations (`reason`) are spectator-only content from the
 *   battle log, so players never receive the opponent's reason through MCP.
 *
 * The returned object is a deep copy; REST and the web UI keep the full room.
 */
export function toMcpRoomView(room: Room): Room {
  const view = structuredClone(room)

  if (view.game) {
    const state = view.game.state as { board?: unknown } | undefined
    if (state && typeof state === 'object' && 'board' in state)
      delete state.board

    // Liar's Dice hands are hidden information: the raw round rolls never
    // leave through MCP, only the identity-aware ASCII board does.
    if (view.game.gameId === 'liar-dice') {
      const liarState = state as {
        round?: { rolls?: unknown }
        rounds?: Array<{ rolls?: unknown }>
      } | undefined
      if (liarState?.round && typeof liarState.round === 'object' && 'rolls' in liarState.round)
        delete liarState.round.rolls
      if (Array.isArray(liarState?.rounds)) {
        for (const round of liarState.rounds) {
          if (round && typeof round === 'object' && 'rolls' in round)
            delete round.rolls
        }
      }
    }

    for (const played of view.game.history) {
      const action = played.action as { reason?: unknown } | undefined
      if (action && typeof action === 'object' && 'reason' in action)
        delete action.reason
    }
  }

  for (const event of view.events) {
    if (event.type === 'move' && event.payload && 'reason' in event.payload)
      delete event.payload.reason
  }

  return view
}

/**
 * ASCII board diagram for games that support one, e.g. Gomoku. Hidden
 * information games take an optional `userId`: the caller only sees their own
 * hand, while spectators (no `userId`) are pointed to the web UI.
 */
export function renderRoomBoard(room: Room, userId?: string): string | undefined {
  if (room.gameId === 'gomoku' && room.game)
    return renderGomokuBoard(room.game.state as GomokuState)
  if (room.gameId === 'liar-dice' && room.game)
    return renderLiarDiceBoard(room.game.state as LiarDiceState, room.players, userId, room.status)
  return undefined
}

/** Room plus spectator URL, ASCII board / challenge summary — the shape every MCP tool returns to callers. */
export function toMcpRoomResult(room: Room): { room: Room, roomUrl: string, board?: string, challenge?: string } {
  const board = renderRoomBoard(room)
  const challenge = room.gameId === '24-point' && room.game
    ? renderTwentyFourChallenge(room.game.state as TwentyFourState)
    : undefined
  return {
    room: toMcpRoomView(room),
    roomUrl: getRoomUrl(room.id),
    ...(board ? { board } : {}),
    ...(challenge ? { challenge } : {}),
  }
}

/**
 * Minimal MCP-facing game state for move tools. The caller already knows the
 * room through the MCP session resolver, so only a room handle plus the
 * current board and turn are returned. Raw coordinates stay internal; human
 * notation such as H8 is used at this boundary.
 */
export function toMcpGameResult(room: Room, userId: string): McpGameResult {
  const player = room.players.find(p => p.sessionId === userId)
  const symbol = player?.slot === 'black' ? 'X' : player?.slot === 'white' ? 'O' : null
  const result: McpGameResult = {
    roomId: room.id,
    game: room.gameId,
    status: room.status,
    yourSide: player?.slot ? (symbol ? `${player.slot} (${symbol})` : player.slot) : null,
    currentPlayer: room.status === 'playing' && room.game?.currentPlayerId
      ? room.game.currentPlayerId === userId ? 'you' : 'opponent'
      : null,
  }

  if (room.status === 'waiting' || room.status === 'playing')
    result.moveNumber = (room.game?.moveCount ?? 0) + 1

  if (room.gameId === 'gomoku' && room.game) {
    const state = room.game.state as GomokuState
    if (state.lastMove)
      result.lastMove = gomokuMoveLabel(state.lastMove)
  }

  if (room.gameId === '24-point' && room.game) {
    const state = room.game.state as TwentyFourState
    const solved = state.progress[userId] ?? 0
    result.question = Math.min(solved + 1, state.puzzles.length)
    result.solved = solved
    result.challenge = renderTwentyFourChallenge(state, userId)
  }

  if (room.gameId === 'liar-dice' && room.game) {
    const state = room.game.state as LiarDiceState
    result.yourDice = (state.round?.rolls[userId] ?? []).join(' ')
    const opponent = room.players.find(player => player.sessionId !== userId)
    result.diceLeft = {
      you: state.diceLeft[userId] ?? 0,
      opponent: opponent ? (state.diceLeft[opponent.sessionId] ?? 0) : 0,
    }
    if (state.currentBid)
      result.currentBid = `${state.currentBid.count}×${state.currentBid.face}`
    result.round = state.roundNumber
    if (room.status === 'playing') {
      const game = createGameInstance(room)
      result.legalMoves = game.getLegalActions(userId).map((action) => {
        if (action.type === 'call')
          return { type: 'call' }
        return {
          type: state.currentBid ? 'raise' : 'bid',
          call: `${action.count ?? 0}x${action.face ?? 0}`,
        }
      })
    }
    if (state.lastCall) {
      result.lastCall = {
        total: state.lastCall.total,
        correct: state.lastCall.correct,
        youLost: state.lastCall.loserId === userId,
      }
    }
    if (state.lastMoveLabel)
      result.lastMove = state.lastMoveLabel
  }

  const board = renderRoomBoard(room, userId)
  if (board)
    result.board = board

  if (room.status === 'finished') {
    result.winner = room.game?.winner === userId ? 'you' : room.game?.winner ? 'opponent' : 'draw'
  }
  if (room.game?.finishReason)
    result.reason = room.game.finishReason

  return result
}
