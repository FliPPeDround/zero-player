import type { InferSelectModel } from 'drizzle-orm'
import { getGameName } from '#shared/games'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

type GameRow = InferSelectModel<typeof schema.games>

interface DatasetPlayer {
  nickname: string
  model: string
  harness: string
  slot?: string
}

interface EntryAcc {
  played: number
  wins: number
  draws: number
}

export interface LeaderboardEntry {
  key: string
  model?: string
  harness?: string
  played: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

const querySchema = z.object({
  gameId: z.string().min(1).optional(),
})

function parsePlayers(raw: string): DatasetPlayer[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed))
      return []
    return parsed.filter((player): player is DatasetPlayer =>
      !!player
      && typeof player === 'object'
      && typeof (player as Record<string, unknown>).nickname === 'string'
      && typeof (player as Record<string, unknown>).model === 'string'
      && typeof (player as Record<string, unknown>).harness === 'string',
    )
  }
  catch {
    return []
  }
}

function bump(
  acc: Map<string, EntryAcc>,
  key: string,
  field: 'played' | 'wins' | 'draws',
  amount = 1,
): void {
  const entry = acc.get(key) ?? { played: 0, wins: 0, draws: 0 }
  entry[field] += amount
  acc.set(key, entry)
}

function toLeaderboard(
  acc: Map<string, EntryAcc>,
  describe: (key: string) => Pick<LeaderboardEntry, 'key' | 'model' | 'harness'>,
): LeaderboardEntry[] {
  return Array.from(acc.entries(), ([key, stats]) => ({
    ...describe(key),
    played: stats.played,
    wins: stats.wins,
    draws: stats.draws,
    losses: stats.played - stats.wins - stats.draws,
    winRate: stats.played > 0 ? stats.wins / stats.played : 0,
  }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played || a.key.localeCompare(b.key))
}

/**
 * Win-rate rankings aggregated from the public game dataset.
 *
 * Only finished matches count. Each side is a separate sample, so a model
 * that plays both seats gets two samples from one match. Draws count as
 * played games but not as wins; win rate is wins / played.
 *
 * The dataset stores winner nicknames instead of session ids, so when several
 * players share the winner nickname (e.g. smoke-test accounts) the win is
 * split evenly between them. Duplicate nicknames with identical model/harness
 * still add up to one win for that entry.
 */
export default defineEventHandler(async (event) => {
  // The homepage is prerendered before the runtime database is available.
  // Return an empty ranking instead of a 500 so a failed build-time query can
  // never be baked into the static page; the client fetches the real data
  // after hydration.
  if (import.meta.prerender)
    return { totals: { finished: 0 }, games: [], model: [], harness: [], combo: [] }

  const { gameId } = await getValidatedQuery(event, querySchema.parse)

  const finishedRows = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.status, 'finished'))

  const gameCounts = new Map<string, number>()
  for (const row of finishedRows)
    gameCounts.set(row.gameId, (gameCounts.get(row.gameId) ?? 0) + 1)

  const rows = gameId
    ? finishedRows.filter((row: GameRow) => row.gameId === gameId)
    : finishedRows

  const modelAcc = new Map<string, EntryAcc>()
  const harnessAcc = new Map<string, EntryAcc>()
  const comboAcc = new Map<string, EntryAcc>()

  for (const row of rows) {
    const players = parsePlayers(row.players)
    for (const player of players) {
      bump(modelAcc, player.model, 'played')
      bump(harnessAcc, player.harness, 'played')
      bump(comboAcc, `${player.model}\u0000${player.harness}`, 'played')
    }

    if (players.length === 0)
      continue

    if (!row.winner) {
      for (const player of players) {
        bump(modelAcc, player.model, 'draws')
        bump(harnessAcc, player.harness, 'draws')
        bump(comboAcc, `${player.model}\u0000${player.harness}`, 'draws')
      }
      continue
    }

    const winners = players.filter(player => player.nickname === row.winner)
    if (winners.length === 0)
      continue

    const share = 1 / winners.length
    for (const winner of winners) {
      bump(modelAcc, winner.model, 'wins', share)
      bump(harnessAcc, winner.harness, 'wins', share)
      bump(comboAcc, `${winner.model}\u0000${winner.harness}`, 'wins', share)
    }
  }

  return {
    totals: { finished: finishedRows.length },
    games: Array.from(gameCounts.entries(), ([id, count]) => ({ id, name: getGameName(id), count }))
      .sort((a, b) => b.count - a.count),
    model: toLeaderboard(modelAcc, key => ({ key })),
    harness: toLeaderboard(harnessAcc, key => ({ key })),
    combo: toLeaderboard(comboAcc, (key) => {
      const [model, harness] = key.split('\u0000')
      return { key: `${model} · ${harness}`, model, harness }
    }),
  }
})
