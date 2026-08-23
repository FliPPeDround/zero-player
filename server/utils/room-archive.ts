import type { Room, RoomSummary } from '#shared/rooms'
import { isTerminalStatus, toRoomSummary } from '#shared/rooms'
import { desc, eq } from 'drizzle-orm'

/**
 * Archived rooms are history: no expiry countdown and no live spectators.
 * The summary otherwise matches the live shape so the lobby renders both
 * through the same card.
 */
export function toArchivedRoomSummary(room: Room): RoomSummary {
  return {
    ...toRoomSummary(room),
    spectatorCount: 0,
    closesAt: undefined,
  }
}

/**
 * Persist the full final state of a terminal room before it leaves KV, so
 * the web room page and the lobby's finished/aborted tabs keep working after
 * the retention window deletes the live copy.
 *
 * Never throws: archiving must not break room deletion. Failures are logged.
 */
export async function archiveRoom(room: Room): Promise<void> {
  if (!isTerminalStatus(room.status))
    return
  try {
    await db
      .insert(schema.archivedRooms)
      .values({
        id: room.id,
        status: room.status,
        updatedAt: room.updatedAt,
        data: JSON.stringify(room),
      })
      .onConflictDoNothing()
  }
  catch (error) {
    console.error(`[archive] Failed to archive room ${room.id}:`, error)
  }
}

export async function getArchivedRoom(roomId: string): Promise<Room | null> {
  try {
    const [row] = await db
      .select({ data: schema.archivedRooms.data })
      .from(schema.archivedRooms)
      .where(eq(schema.archivedRooms.id, roomId))
      .limit(1)
    if (!row)
      return null
    const room = safeJsonParse(row.data)
    return room && typeof room === 'object' && 'id' in room ? room as Room : null
  }
  catch (error) {
    console.error(`[archive] Failed to load archived room ${roomId}:`, error)
    return null
  }
}

/**
 * Newest archived room summaries for the lobby merge. Read failures degrade
 * to an empty list rather than breaking the room list endpoint.
 */
export async function listArchivedRoomSummaries(limit: number): Promise<RoomSummary[]> {
  try {
    const rows = await db
      .select({ data: schema.archivedRooms.data })
      .from(schema.archivedRooms)
      .orderBy(desc(schema.archivedRooms.updatedAt))
      .limit(limit)
    return rows
      .map(row => safeJsonParse(row.data))
      .filter((room): room is Room => room !== null && typeof room === 'object' && 'id' in room)
      .map(room => toArchivedRoomSummary(room))
  }
  catch (error) {
    console.error('[archive] Failed to list archived rooms:', error)
    return []
  }
}
