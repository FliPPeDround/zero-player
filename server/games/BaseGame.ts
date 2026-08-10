import type {
  GameActionRecord,
  GamePlayer,
  GameResult,
  GameSnapshot,
  GameStatus,
  PlayedAction,
} from '#shared/game'
import type { GameDefinition } from '#shared/games'
import type { Room } from '#shared/rooms'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'
import { toMcpRoomResult } from '../mcp/utils/room-view'
import { getMcpUserId } from '../mcp/utils/user-id'
import { DEFAULT_WAIT_TIMEOUT_SECONDS, waitTimeoutMessage } from '../mcp/utils/wait-message'

export const GAME_SCHEMA_VERSION = 1

const AUTH_ID_PATTERN = /^\d{4}$/

export type MoveOutcome
  = { ok: true, finished: boolean, winner?: string, reason?: string, details?: Record<string, unknown> }
    | { ok: false, error: string }

/**
 * Contract every game implements to expose its MCP "make a move" tool.
 * Schema, examples and notation parsing are game knowledge, so they live next
 * to the engine, and `BaseGame.defineMcpMoveTool` wires them into a
 * registered tool. Each game exposes it as a static `mcpMoveDefinition` on
 * its class, which the registry (`server/games/registry.ts`) enforces when
 * the game is registered.
 */
export interface GameMcpMoveDefinition {
  gameId: string
  toolName: string
  title: string
  description: string
  inputSchema: Record<string, z.ZodType>
  inputExamples: Record<string, unknown>[]
  toAction: (args: Record<string, unknown>) => GameActionRecord
  describeAction: (args: Record<string, unknown>) => string
}

/**
 * Base class every platform game implements.
 *
 * Design notes, from first principles:
 *
 * - A game is a pure state machine: state + history of applied actions fully
 *   describe a match. Actions are validated against the current state before
 *   they are applied, and the server is the only writer.
 * - State transitions are immutable (`applyAction` returns a new state), which
 *   makes undo, replay and spectator snapshots trivial.
 * - The room system never sees rules. It talks to this class through a small
 *   surface (`start`, `play`, `resign`, `snapshot`, `restore`) and treats the
 *   snapshot as an opaque document.
 * - Games with randomness or hidden information should override
 *   `recomputeState` or store their own replay seeds; the default replay is
 *   for deterministic games.
 */
export abstract class BaseGame<
  TAction extends GameActionRecord = GameActionRecord,
  TState = unknown,
> {
  abstract readonly gameId: string

  /**
   * Platform metadata of this game (sides, capacity, icon, ...). Each game
   * owns its definition, so the room system and the engine never need a
   * global registry lookup.
   */
  abstract readonly definition: GameDefinition

  readonly roomId: string

  protected readonly players: GamePlayer[]
  protected state: TState
  protected history: PlayedAction<TAction>[] = []

  private _status: GameStatus = 'waiting'
  private _winner?: string
  private _finishReason?: string
  private _finishDetails?: Record<string, unknown>

  constructor(roomId: string, players: GamePlayer[]) {
    this.roomId = roomId
    this.players = players.map(player => ({ ...player }))
    this.state = this.createInitialState()
  }

  /**
   * Build this game's MCP "make a move" tool from its static
   * `mcpMoveDefinition`. The one-line tool file under
   * `server/mcp/tools/games/` registers the result. Games with richer needs
   * (multiple tools, custom annotations) can override this.
   */
  static defineMcpMoveTool(definition: GameMcpMoveDefinition) {
    return defineMcpTool({
      name: definition.toolName,
      group: 'games',
      description: `${definition.description} The call blocks until it is your turn (waiting for the game to start if needed), submits your move, then blocks again until the opponent has moved or the match ends — the returned room always contains the opponent's latest move, and the current board is included as an ASCII diagram in the board field. On timeout it returns the latest state with a message asking whether to keep waiting or exit.`,
      inputSchema: {
        ...definition.inputSchema,
        authId: z.string().regex(AUTH_ID_PATTERN).describe('Your 4-digit auth ID from login; required for every stateful call'),
        timeoutSeconds: z.number().int().min(5).max(300).optional().describe('How long to wait for the opponent before returning (default 60)'),
      },
      inputExamples: definition.inputExamples,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const authId = (args as Record<string, unknown>).authId
        const timeoutSeconds = (args as Record<string, unknown>).timeoutSeconds
        const userId = getMcpUserId(useEvent(), authId)
        const timeoutMs = (typeof timeoutSeconds === 'number' ? timeoutSeconds : DEFAULT_WAIT_TIMEOUT_SECONDS) * 1000
        const waitedSeconds = typeof timeoutSeconds === 'number' ? timeoutSeconds : DEFAULT_WAIT_TIMEOUT_SECONDS
        const present = (room: Room) => toMcpRoomResult(room)

        const headers = { 'x-session-id': userId }
        const { getCurrentRoomId, createRoomWaiter, describeRoomOutcome } = await import('../mcp/utils/current-room')
        const roomId = await getCurrentRoomId(userId)

        const isTerminal = (candidate: Room) => candidate.status === 'finished' || candidate.status === 'aborted'
        const isMyTurn = (candidate: Room) => candidate.status === 'playing' && candidate.game?.currentPlayerId === userId
        const isDone = (candidate: Room) => isTerminal(candidate) || isMyTurn(candidate)

        const action = definition.toAction(args as Record<string, unknown>)

        // Subscribe before any REST read so no room update can slip between
        // the round trips and the listener.
        let waiter = createRoomWaiter(roomId, isDone, timeoutMs)
        try {
          const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)

          if (room.gameId !== definition.gameId) {
            throw createError({
              statusCode: 409,
              statusMessage: `You are in a ${room.gameId} room; use make-${room.gameId}-move instead`,
            })
          }

          if (isTerminal(room)) {
            waiter.cancel()
            return {
              message: `${describeRoomOutcome(room, userId)}; no move submitted.`,
              ...present(room),
            }
          }

          if (!isMyTurn(room)) {
            const outcome = await waiter.wait()
            const latest = outcome.room ?? room
            if (outcome.closed)
              return { message: 'Room was closed.', ...present(latest) }
            if (outcome.timedOut) {
              return {
                message: waitTimeoutMessage({
                  waitedSeconds,
                  waitedFor: 'the opponent to join or move',
                  continueHint: `call ${definition.toolName} again to keep waiting`,
                  exitHint: 'call leave-room to give up your seat (waiting rooms) or close-room to abort as host',
                }),
                ...present(latest),
              }
            }
            if (isTerminal(latest))
              return { message: `${describeRoomOutcome(latest, userId)}; no move submitted.`, ...present(latest) }
          }

          // It is our turn: commit the move. Subscribe for the reply before
          // posting so the terminal event of a winning move is never missed.
          waiter.cancel()
          waiter = createRoomWaiter(roomId, isDone, timeoutMs)
          const updatedRoom = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/moves`, {
            method: 'POST',
            headers,
            body: action,
          })

          if (isTerminal(updatedRoom) || isMyTurn(updatedRoom)) {
            waiter.cancel()
            return {
              message: isTerminal(updatedRoom)
                ? `${definition.describeAction(args as Record<string, unknown>)}. ${describeRoomOutcome(updatedRoom, userId)}.`
                : `${definition.describeAction(args as Record<string, unknown>)}. The opponent has moved — it is your turn.`,
              ...present(updatedRoom),
            }
          }

          const outcome = await waiter.wait()
          const finalRoom = outcome.room ?? updatedRoom
          if (outcome.closed)
            return { message: 'Room was closed.', ...present(finalRoom) }
          if (outcome.timedOut) {
            return {
              message: `${definition.describeAction(args as Record<string, unknown>)}. ${waitTimeoutMessage({
                waitedSeconds,
                waitedFor: 'the opponent\'s reply',
                continueHint: `call ${definition.toolName} again to keep waiting`,
                exitHint: 'call close-room to abort the game as host',
              })}`,
              ...present(finalRoom),
            }
          }
          return {
            message: isTerminal(finalRoom)
              ? `${definition.describeAction(args as Record<string, unknown>)}. ${describeRoomOutcome(finalRoom, userId)}.`
              : `${definition.describeAction(args as Record<string, unknown>)}. The opponent has moved — it is your turn.`,
            ...present(finalRoom),
          }
        }
        finally {
          waiter.cancel()
        }
      },
    })
  }

  get status(): GameStatus {
    return this._status
  }

  get winner(): string | undefined {
    return this._winner
  }

  get finishReason(): string | undefined {
    return this._finishReason
  }

  get finishDetails(): Record<string, unknown> | undefined {
    return this._finishDetails
  }

  get minPlayers(): number {
    return this.definition.minPlayers
  }

  get maxPlayers(): number {
    return this.definition.maxPlayers
  }

  get currentPlayerId(): string | null {
    return this._status === 'finished'
      ? null
      : this.getCurrentPlayerId(this.state, this.history, this.players)
  }

  abstract createInitialState(): TState

  abstract getCurrentPlayerId(
    state: TState,
    history: PlayedAction<TAction>[],
    players: GamePlayer[],
  ): string | null

  abstract validateAction(playerId: string, action: TAction): string | null

  abstract applyAction(state: TState, action: TAction, playerId: string): TState

  abstract getResult(
    state: TState,
    history: PlayedAction<TAction>[],
    players: GamePlayer[],
  ): GameResult | null

  abstract getLegalActions(playerId: string): TAction[]

  start(): void {
    if (this._status !== 'waiting')
      throw new Error(`Game ${this.gameId} cannot start from status ${this._status}`)
    if (this.players.length < this.minPlayers)
      throw new Error(`Game ${this.gameId} needs at least ${this.minPlayers} players`)
    this.state = this.createInitialState()
    this.history = []
    this._status = 'playing'
  }

  play(playerId: string, action: TAction): MoveOutcome {
    if (this._status !== 'playing')
      return { ok: false, error: `Game is ${this._status}` }
    if (this.currentPlayerId !== playerId)
      return { ok: false, error: 'Not your turn' }

    const validationError = this.validateAction(playerId, action)
    if (validationError)
      return { ok: false, error: validationError }

    this.state = this.applyAction(this.state, action, playerId)
    this.history.push({ playerId, action: { ...action } })

    const result = this.getResult(this.state, this.history, this.players)
    if (result) {
      this._status = 'finished'
      this._winner = result.winner
      this._finishReason = result.reason
      this._finishDetails = result.details
    }

    return {
      ok: true,
      finished: this._status === 'finished',
      winner: this._winner,
      reason: this._finishReason,
      details: this._finishDetails,
    }
  }

  resign(playerId: string): MoveOutcome {
    if (this._status !== 'playing')
      return { ok: false, error: `Game is ${this._status}` }
    if (!this.players.some(player => player.sessionId === playerId))
      return { ok: false, error: 'Unknown player' }

    const opponent = this.players.find(player => player.sessionId !== playerId)
    this._status = 'finished'
    this._winner = opponent?.sessionId
    this._finishReason = 'resign'
    this._finishDetails = { by: playerId }

    return {
      ok: true,
      finished: true,
      winner: this._winner,
      reason: this._finishReason,
      details: this._finishDetails,
    }
  }

  /**
   * Rewind the last action and recompute state from the remaining history.
   * Deterministic games replay cheaply; games with randomness or hidden
   * information should override `recomputeState` to restore recorded state.
   */
  undo(): boolean {
    if (this._status === 'waiting' || this.history.length === 0)
      return false

    this.history.pop()
    this.recomputeState()
    this._status = 'playing'
    this._winner = undefined
    this._finishReason = undefined
    this._finishDetails = undefined
    return true
  }

  protected recomputeState(): void {
    this.state = this.createInitialState()
    for (const { action, playerId } of this.history)
      this.state = this.applyAction(this.state, action, playerId)
  }

  snapshot(): GameSnapshot {
    return {
      schemaVersion: GAME_SCHEMA_VERSION,
      gameId: this.gameId,
      status: this._status,
      players: this.players.map(player => ({ ...player })),
      currentPlayerId: this.currentPlayerId,
      moveCount: this.history.length,
      history: this.history.map(({ action, playerId }) => ({
        playerId,
        action: { ...action },
      })),
      winner: this._winner,
      finishReason: this._finishReason,
      finishDetails: this._finishDetails ? { ...this._finishDetails } : undefined,
      state: JSON.parse(JSON.stringify(this.state)),
    }
  }

  restore(snapshot: GameSnapshot): void {
    if (snapshot.gameId !== this.gameId)
      throw new Error(`Snapshot belongs to ${snapshot.gameId}, not ${this.gameId}`)

    this.players.splice(
      0,
      this.players.length,
      ...snapshot.players.map(player => ({ ...player })),
    )
    this.history = snapshot.history.map(({ action, playerId }) => ({
      playerId,
      action: { ...action } as TAction,
    }))
    this.state = snapshot.state as TState
    this._status = snapshot.status
    this._winner = snapshot.winner
    this._finishReason = snapshot.finishReason
    this._finishDetails = snapshot.finishDetails ? { ...snapshot.finishDetails } : undefined
  }
}
