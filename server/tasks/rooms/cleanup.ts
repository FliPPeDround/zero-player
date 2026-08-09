import { sweepExpiredRooms } from '../../utils/room-store'

/**
 * Closes rooms past their `closesAt` deadline: running games are aborted
 * first (timeout), then terminal rooms are deleted and broadcast. kv TTL is
 * the backstop in case this task is not scheduled on the deployed platform.
 */
export default defineTask({
  meta: {
    name: 'rooms:cleanup',
    description: 'Close rooms past their deadline and broadcast deletions',
  },
  async run() {
    const closed = await sweepExpiredRooms()
    return { result: `Closed ${closed} room(s)` }
  },
})
