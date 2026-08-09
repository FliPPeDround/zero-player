import type { GameActionRecord } from '#shared/game'
import type { Room } from '#shared/rooms'
import { parseGomokuMove } from '#shared/gomoku'
import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'
import { getCurrentRoomId } from '../mcp/utils/current-room'

const GOMOKU_POINT_PATTERN = /^[a-o]([1-9]|1[0-5])$/i

/**
 * Each game declares its own MCP "make a move" tool. The room layer stays
 * generic: adding a game means adding an engine, one entry here, and a
 * one-line `make-<game>-move.ts` file under `server/mcp/tools/games/`.
 */
export interface GameMcpMoveDefinition {
  gameId: string
  toolName: string
  title: string
  description: string
  inputSchema: Record<string, z.ZodType>
  inputExamples: Record<string, unknown>[]
  toAction: (args: Record<string, unknown>) => GameActionRecord
  describeAction: (args: Record<string, unknown>) => string
}

export const GAME_MCP_MOVE_DEFINITIONS: Record<string, GameMcpMoveDefinition> = {
  gomoku: {
    gameId: 'gomoku',
    toolName: 'make-gomoku-move',
    title: 'Make Gomoku move',
    description: 'Place a stone on the Gomoku board using standard chess-like notation, e.g. H8. Columns are A-O, rows are 1-15. Only call this when it is your turn and the room snapshot shows an empty cell.',
    inputSchema: {
      move: z.string()
        .regex(GOMOKU_POINT_PATTERN, 'Use standard notation like H8, e.g. A1, H8 or O15')
        .describe('Standard Gomoku coordinate, e.g. H8'),
    },
    inputExamples: [
      { move: 'H8' },
      { move: 'A1' },
    ],
    toAction: ({ move }) => {
      const point = parseGomokuMove(String(move ?? ''))
      if (!point)
        throw createError({ statusCode: 400, statusMessage: `Invalid Gomoku move: ${String(move)}` })
      return { type: 'place', x: point.x, y: point.y }
    },
    describeAction: ({ move }) => `Placed a stone at ${String(move)}`,
  },
}

/**
 * Turn a game-specific MCP definition into a discoverable tool. Each game
 * registers one small file under `server/mcp/tools/games/`, while the schema
 * and parsing logic stay next to the engine in this registry.
 */
export function defineGameMcpTool(definition: GameMcpMoveDefinition) {
  return defineMcpTool({
    name: definition.toolName,
    group: 'games',
    description: definition.description,
    inputSchema: definition.inputSchema,
    inputExamples: definition.inputExamples,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (args) => {
      const sessionId = getHeader(useEvent(), 'mcp-session-id')
      if (!sessionId)
        throw createError({ statusCode: 401, statusMessage: 'Missing MCP session id' })

      const headers = { 'x-session-id': sessionId }
      const roomId = await getCurrentRoomId(sessionId)
      const room = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}`)

      if (room.gameId !== definition.gameId) {
        throw createError({
          statusCode: 409,
          statusMessage: `You are in a ${room.gameId} room; use make-${room.gameId}-move instead`,
        })
      }

      const action = definition.toAction(args as Record<string, unknown>)
      const updatedRoom = await $fetch<Room>(`/api/rooms/${encodeURIComponent(roomId)}/moves`, {
        method: 'POST',
        headers,
        body: action,
      })
      return {
        message: `${definition.describeAction(args as Record<string, unknown>)}.`,
        room: updatedRoom,
      }
    },
  })
}
