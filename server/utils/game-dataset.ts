import type { GameActionRecord } from '#shared/game'
import type { Room } from '#shared/rooms'
import type { InferSelectModel } from 'drizzle-orm'
import { gomokuMoveLabel } from '#shared/gomoku'
import { eq } from 'drizzle-orm'

export type DatasetGameRow = InferSelectModel<typeof schema.games>
export type DatasetMoveRow = InferSelectModel<typeof schema.moves>

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

/**
 * Dataset game row with JSON-encoded columns decoded for API consumers.
 */
export function toDatasetGameView(row: DatasetGameRow): Record<string, unknown> {
  return {
    ...row,
    players: safeJsonParse(row.players),
    finishDetails: row.finishDetails ? safeJsonParse(row.finishDetails) : null,
  }
}

/**
 * Archive a terminal room (`finished`/`aborted`) into the public AI dataset.
 *
 * Called from `finishGame`/`abortRoom` right after the room is persisted to
 * KV. The dataset copy lives in SQLite and survives the KV retention window
 * deletion, so every played move (coordinates + AI-provided reason) is kept
 * for public use as training data.
 *
 * Never throws: archiving must not break the game flow. Failures are logged.
 */
export async function persistFinishedGame(room: Room): Promise<void> {
  const game = room.game
  if (!game || game.history.length === 0)
    return
  if (room.status !== 'finished' && room.status !== 'aborted')
    return

  try {
    const existing = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(eq(schema.games.id, room.id))
      .limit(1)
    if (existing.length > 0)
      return

    // Every history entry produces exactly one `move` event in `submitGameMove`
    // (no other callers append move events), so zipping by order is exact.
    const moveEvents = room.events.filter(event => event.type === 'move')

    const moveRows = game.history.map((entry, index) => {
      const action = entry.action
      const player = room.players.find(p => p.sessionId === entry.playerId)
      return {
        gameId: room.id,
        moveNumber: index + 1,
        nickname: player?.nickname ?? null,
        side: player?.slot ?? null,
        type: typeof action.type === 'string' ? action.type : 'unknown',
        x: typeof action.x === 'number' ? action.x : null,
        y: typeof action.y === 'number' ? action.y : null,
        move: moveNotation(room.gameId, action),
        reason: typeof action.reason === 'string' && action.reason.trim() ? action.reason.trim() : null,
        at: moveEvents[index]?.at ?? null,
      }
    })

    const gameRow = {
      id: room.id,
      gameId: room.gameId,
      status: room.status,
      name: room.name,
      createdAt: room.createdAt,
      startedAt: room.startedAt ?? null,
      endedAt: room.status === 'finished' ? room.finishedAt ?? null : room.abortedAt ?? null,
      winner: room.winner ?? null,
      finishReason: game.finishReason ?? null,
      finishDetails: game.finishDetails ? JSON.stringify(game.finishDetails) : null,
      players: JSON.stringify(room.players.map(player => ({
        nickname: player.nickname,
        model: player.model,
        harness: player.harness,
        slot: player.slot,
      }))),
      moveCount: game.history.length,
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.games).values(gameRow)
      await tx.insert(schema.moves).values(moveRows)
    })
  }
  catch (error) {
    console.error(`[dataset] Failed to archive game ${room.id}:`, error)
  }
}

function moveNotation(gameId: string, action: GameActionRecord): string | null {
  if (gameId === 'gomoku' && typeof action.x === 'number' && typeof action.y === 'number')
    return gomokuMoveLabel({ x: action.x, y: action.y })
  return null
}
