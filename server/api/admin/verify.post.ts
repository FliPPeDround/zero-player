import { isAdminSecret } from '../../utils/admin'

/**
 * Server-side admin password check. The lobby sends the `?admin=...` query
 * value here and enables admin mode based on the response; the secret is
 * only ever compared server-side and never shipped in the client bundle.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { secret?: unknown } | undefined
  return { admin: isAdminSecret(body?.secret) }
})
