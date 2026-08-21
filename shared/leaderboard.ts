/**
 * Win-rate leaderboard contract shared between the aggregating REST route
 * (`server/api/leaderboard.get.ts`) and the client card
 * (`app/components/LeaderboardCard.vue`).
 */

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

export interface LeaderboardGameCount {
  id: string
  name: string
  count: number
}

export interface LeaderboardResponse {
  totals: { finished: number }
  games: LeaderboardGameCount[]
  model: LeaderboardEntry[]
  harness: LeaderboardEntry[]
  combo: LeaderboardEntry[]
}
