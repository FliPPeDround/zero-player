// @unocss-include

import type { GameActionRecord } from './game'
import type { GameDefinition } from './games'

export const TWENTY_FOUR_QUESTIONS = 6
export const TWENTY_FOUR_TARGET = 24

export interface TwentyFourAction extends GameActionRecord {
  type: 'answer'
  expression: string
  /** Optional agent-provided explanation shown to spectators. */
  reason?: string
}

export interface TwentyFourState {
  /** Six shared puzzles; each entry holds the four numbers to combine. */
  puzzles: number[][]
  /** Session id -> number of correctly solved questions (0..6). */
  progress: Record<string, number>
  /** Session id -> total attempts (correct and wrong) made by that player. */
  attempts: Record<string, number>
  /**
   * Session id -> ISO time the player called `start-game`. Each player's
   * personal race clock runs from this moment to their own finish, because
   * the server cannot push the questions to both MCP agents simultaneously.
   */
  playerStarts: Record<string, string>
  /** Session id -> ISO time the player solved their last question. */
  finishedAt?: Record<string, string>
  /** Feedback for the most recently applied answer, used for event metadata. */
  lastResult?: {
    playerId: string
    question: number
    correct: boolean
    expression: string
    feedback: string
  }
}

/**
 * Human-readable challenge summary for MCP clients, e.g.
 * `Question 2/6: 3 3 8 8 (you solved 1/6)`.
 */
export function renderTwentyFourChallenge(state: TwentyFourState, playerId?: string): string {
  const solved = playerId ? (state.progress[playerId] ?? 0) : 0
  const index = Math.min(solved, state.puzzles.length - 1)
  const puzzle = state.puzzles[index] ?? []
  const prefix = playerId
    ? `you solved ${solved}/${state.puzzles.length}`
    : `question ${index + 1}/${state.puzzles.length}`
  return `Question ${index + 1}/${state.puzzles.length}: ${puzzle.join(' ')} (${prefix})`
}

/**
 * 24 Point platform definition. Both agents race on the same six puzzles;
 * each one only has to beat their own clock (which starts when they call
 * `start-game`), so the game is not turn-based.
 */
export const twentyFourPointDefinition = {
  id: '24-point',
  name: '24 Point',
  description: 'Make 24 by combining four numbers with + - * / and parentheses. Each agent races on their own clock (from their start-game call to solving all six questions); the agent with the shortest personal time wins.',
  sides: [
    {
      key: 'one',
      label: 'Agent 1',
      color: 'primary',
      surfaceClass: 'bg-primary-500/10 dark:bg-primary-400/10',
      dotClass: 'bg-primary-500 ring-1 ring-primary-500/40',
      avatarClass: 'side-avatar-one',
    },
    {
      key: 'two',
      label: 'Agent 2',
      color: 'primary',
      surfaceClass: 'bg-primary-500/10 dark:bg-primary-400/10',
      dotClass: 'bg-primary-500 ring-1 ring-primary-500/40',
      avatarClass: 'side-avatar-two',
    },
  ],
  minPlayers: 2,
  maxPlayers: 2,
  turnBased: false,
  icon: 'i-carbon-function-math',
} as const satisfies GameDefinition
