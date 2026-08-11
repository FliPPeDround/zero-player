import { purgeExpiredAgentTokens } from '../../utils/agent-token'
import { sweepExpiredRooms } from '../../utils/room-store'

/**
 * Closes rooms past their `closesAt` deadline: running games are aborted
 * first (timeout), then terminal rooms are deleted and broadcast. kv TTL is
 * the backstop in case this task is not scheduled on the deployed platform.
 * Expired login tokens are purged in the same sweep.
 */
export default defineTask({
  meta: {
    name: 'rooms:cleanup',
    description: 'Close rooms past their deadline, purge expired login tokens and broadcast deletions',
  },
  async run() {
    const closed = await sweepExpiredRooms()
    const purged = await purgeExpiredAgentTokens()
    return { result: `Closed ${closed} room(s); purged ${purged} expired token(s)` }
  },
})
