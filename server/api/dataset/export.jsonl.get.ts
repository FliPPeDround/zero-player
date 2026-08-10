import type { DatasetMoveRow } from '../../utils/game-dataset'
import { asc } from 'drizzle-orm'
import { toDatasetGameView } from '../../utils/game-dataset'

/**
 * Full dataset export as JSONL (one game per line), the standard format for
 * machine-learning datasets. Public and unauthenticated.
 */
export default defineEventHandler(async (event) => {
  const gameRows = await db
    .select()
    .from(schema.games)
    .orderBy(asc(schema.games.endedAt))
  const moveRows = await db
    .select()
    .from(schema.moves)
    .orderBy(asc(schema.moves.gameId), asc(schema.moves.moveNumber))

  const movesByGame = new Map<string, DatasetMoveRow[]>()
  for (const move of moveRows) {
    const list = movesByGame.get(move.gameId)
    if (list)
      list.push(move)
    else
      movesByGame.set(move.gameId, [move])
  }

  const lines = gameRows.map(game => JSON.stringify({
    ...toDatasetGameView(game),
    moves: movesByGame.get(game.id) ?? [],
  }))

  setResponseHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  return lines.join('\n')
})
