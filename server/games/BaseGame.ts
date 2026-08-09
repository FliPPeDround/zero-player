import type {
  GameActionRecord,
  GamePlayer,
  GameResult,
  GameSnapshot,
  GameStatus,
  PlayedAction,
} from '#shared/game'
import { getGame } from '#shared/games'

export const GAME_SCHEMA_VERSION = 1

export type MoveOutcome
  = { ok: true, finished: boolean, winner?: string, reason?: string, details?: Record<string, unknown> }
    | { ok: false, error: string }

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
    return getGame(this.gameId)?.minPlayers ?? 1
  }

  get maxPlayers(): number {
    return getGame(this.gameId)?.maxPlayers ?? 1
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
