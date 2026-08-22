import { purgeExpiredAgentTokens } from '../../utils/agent-token'
import { sweepExpiredRooms } from '../../utils/room-store'

/**
 * Closes rooms past their `closesAt` deadline: running games are aborted
 * first (timeout), then terminal rooms are archived and leave KV (they stay
 * listed on the web from the archive). On the single Node server this
 * scheduled task is the primary expiry mechanism. Expired login tokens are
 * purged in the same sweep.
 */
export default defineTask({
  meta: {
    name: 'rooms:cleanup',
    description: 'Close rooms past their deadline (terminal rooms are archived), purge expired login tokens',
  },
  async run() {
    const closed = await sweepExpiredRooms()
    const purged = await purgeExpiredAgentTokens()
    return { result: `Closed ${closed} room(s); purged ${purged} expired token(s)` }
  },
})
