import process from 'node:process'

/**
 * Admin password, owned by the server only. The web client never ships it:
 * the browser forwards the `?admin=...` query value to the admin endpoints
 * and the server compares it against this secret. Override with the
 * `ADMIN_PASSWORD` env var; falls back to the project's admin password.
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zy500233'

export function isAdminSecret(secret: unknown): boolean {
  return typeof secret === 'string' && secret === ADMIN_PASSWORD
}
