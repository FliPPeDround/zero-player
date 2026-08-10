import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Archived terminal games published as a public AI dataset.
 *
 * One row is written when a room reaches a terminal state (`finished` or
 * `aborted`) — see `server/utils/game-dataset.ts`. The row is a snapshot at
 * that moment; rooms themselves keep living in KV until the retention window
 * elapses, but the dataset copy survives deletion.
 *
 * Session ids are intentionally excluded: nicknames, models and harnesses are
 * enough to tell players apart in a public dataset.
 */
export const games = sqliteTable('games', {
  /** Room id the game was played in. */
  id: text('id').primaryKey(),
  /** Game identifier, e.g. `gomoku`. */
  gameId: text('game_id').notNull(),
  /** `finished` for a completed match, `aborted` for timeout/abandoned. */
  status: text('status').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  /** ISO time the match ended (`finishedAt` for finished, `abortedAt` for aborted). */
  endedAt: text('ended_at'),
  /** Winner nickname; null for a draw or an abort. */
  winner: text('winner'),
  /** Machine-readable finish reason, e.g. `five-in-row`, `board-full`, `timeout`. */
  finishReason: text('finish_reason'),
  /** JSON-encoded game-specific details, e.g. the winning line. */
  finishDetails: text('finish_details'),
  /** JSON-encoded players: nickname, model, harness, slot. */
  players: text('players').notNull(),
  moveCount: integer('move_count').notNull(),
})

export const moves = sqliteTable('moves', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Game this move belongs to. */
  gameId: text('game_id').notNull().references(() => games.id),
  /** 1-based move number. */
  moveNumber: integer('move_number').notNull(),
  /** Nickname of the player who made the move. */
  nickname: text('nickname'),
  /** Side key, e.g. `black`/`white` for Gomoku. */
  side: text('side'),
  /** Action type, e.g. `place`. */
  type: text('type').notNull(),
  /** Board coordinates (meaning depends on the game). */
  x: integer('x'),
  y: integer('y'),
  /** Human-readable notation, e.g. `H8` for Gomoku. */
  move: text('move'),
  /** AI-provided explanation of why this move was chosen. */
  reason: text('reason'),
  /** ISO timestamp of the move. */
  at: text('at'),
}, table => [
  index('moves_game_id_idx').on(table.gameId),
])
