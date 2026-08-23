/**
 * Parse a JSON string from storage, returning `null` instead of throwing on
 * corrupted or truncated values.
 */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}
