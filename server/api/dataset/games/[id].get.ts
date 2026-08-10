import { asc, eq } from 'drizzle-orm'
import { toDatasetGameView } from '../../../utils/game-dataset'

/**
 * Single archived game with its full move list (coordinates + AI reasons).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing game id' })

  const [game] = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, id))
    .limit(1)
  if (!game)
    throw createError({ statusCode: 404, statusMessage: 'Game not found' })

  const moveRows = await db
    .select()
    .from(schema.moves)
    .where(eq(schema.moves.gameId, id))
    .orderBy(asc(schema.moves.moveNumber))

  return {
    ...toDatasetGameView(game),
    moves: moveRows,
  }
})
