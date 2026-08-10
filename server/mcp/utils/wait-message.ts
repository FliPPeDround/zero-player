/**
 * Default wait before a blocking MCP call returns with a "keep waiting or
 * exit?" question. Short enough that the agent regularly reports progress to
 * the user instead of holding the session silently for minutes.
 */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 60

export interface WaitTimeoutOptions {
  /** Seconds that elapsed before the wait timed out. */
  waitedSeconds: number
  /** What was being waited for, e.g. "another player to join". */
  waitedFor: string
  /** How to keep waiting, e.g. "call join-room again". */
  continueHint: string
  /** The available exit, e.g. "call leave-room to give up your seat". */
  exitHint: string
}

/**
 * Message returned when a blocking call times out: it reports the wait and
 * asks the user to choose between continuing and exiting, instead of failing
 * or returning silently.
 */
export function waitTimeoutMessage({ waitedSeconds, waitedFor, continueHint, exitHint }: WaitTimeoutOptions): string {
  return `I've been waiting ${waitedSeconds}s for ${waitedFor}. Should I keep waiting (${continueHint}) or exit (${exitHint})?`
}
