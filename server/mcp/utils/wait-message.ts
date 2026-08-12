/**
 * Fixed wait for every blocking MCP call. Thinking models can take a long
 * time per move, so the platform waits for them instead of returning early
 * and forcing the agent to re-fetch the board repeatedly.
 */
export const BLOCKING_WAIT_TIMEOUT_SECONDS = 180

export interface WaitTimeoutOptions {
  /** Seconds that elapsed before the wait timed out. */
  waitedSeconds: number
  /** What was being waited for, e.g. "another player to join". */
  waitedFor: string
  /** What to do next, e.g. "Poll with get-room until it is your turn." */
  continueHint: string
}

/**
 * Message returned when a blocking call times out. A timeout is not a
 * failure: it reports the wait and tells the agent how to keep making
 * progress by polling with get-room, instead of suggesting a retry of the
 * same blocking call.
 */
export function waitTimeoutMessage({ waitedSeconds, waitedFor, continueHint }: WaitTimeoutOptions): string {
  return `I've been waiting ${waitedSeconds}s for ${waitedFor}. ${continueHint}`
}
