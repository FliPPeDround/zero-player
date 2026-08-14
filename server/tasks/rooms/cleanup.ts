import { purgeExpiredAgentTokens } from '../../utils/agent-token'
import { sweepExpiredRooms } from '../../utils/room-store'

/**
 * Closes rooms past their `closesAt` deadline: running games are aborted
 * first (timeout), then terminal rooms are deleted and broadcast. On the
 * single Node server this scheduled task is the primary expiry mechanism.
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
