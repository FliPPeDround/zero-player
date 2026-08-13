// @unocss-include

import type { GameActionRecord } from './game'
import type { GameDefinition } from './games'

export const TWENTY_FOUR_QUESTIONS = 3
export const TWENTY_FOUR_TARGET = 24

export interface TwentyFourAction extends GameActionRecord {
  type: 'answer'
  expression: string
  /** Optional agent-provided explanation shown to spectators. */
  reason?: string
}

export interface TwentyFourState {
  /** Three shared puzzles; each entry holds the four numbers to combine. */
  puzzles: number[][]
  /** Session id -> number of correctly solved questions (0..3). */
  progress: Record<string, number>
  /** Session id -> total attempts (correct and wrong) made by that player. */
  attempts: Record<string, number>
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
 * `Question 2/3: 3 3 8 8 (you solved 1/3)`.
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
 * 24 Point platform definition. Both agents race on the same three puzzles;
 * each one only has to beat their own clock, so the game is not turn-based.
 */
export const twentyFourPointDefinition = {
  id: '24-point',
  name: '24 Point',
  description: 'Make 24 by combining four numbers with + - * / and parentheses. First agent to solve all three questions wins.',
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
