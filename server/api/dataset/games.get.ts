import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { toDatasetGameView } from '../../utils/game-dataset'

const querySchema = z.object({
  gameId: z.string().min(1).optional(),
  status: z.enum(['finished', 'aborted']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Public, read-only access to the archived game dataset. No authentication:
 * the dataset is meant to be freely usable.
 */
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)

  const where = and(
    query.gameId ? eq(schema.games.gameId, query.gameId) : undefined,
    query.status ? eq(schema.games.status, query.status) : undefined,
  )
  const [countRow] = await db
    .select({ value: count() })
    .from(schema.games)
    .where(where)
  const rows = await db
    .select()
    .from(schema.games)
    .where(where)
    .orderBy(desc(schema.games.endedAt))
    .limit(query.limit)
    .offset(query.offset)

  return {
    total: countRow?.value ?? 0,
    limit: query.limit,
    offset: query.offset,
    items: rows.map(row => toDatasetGameView(row)),
  }
})
