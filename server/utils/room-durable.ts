import type { H3Event } from 'h3'
import { toWebRequest } from 'h3'
import { getDurableObjectStub } from './room-store'

/**
 * Run a room-mutating handler inside the Nitro WebSocket Durable Object.
 *
 * On Cloudflare, WebSocket peers live in `$DurableObject` while REST requests
 * are handled by the main Worker isolate. Forwarding every room mutation into
 * the Durable Object makes the mutation and the WS broadcast happen in the
 * same isolate, so connected peers always see the update — no cross-isolate
 * bridge involved in gameplay. Inside the DO the same route re-runs and the
 * stub resolves to null, so the fallback executes locally; outside it (local
 * dev, prerender, scheduled tasks) there is no DO stub either and the
 * fallback runs in-process.
 */
export async function forwardToRoomDurable(event: H3Event, fallback: () => Promise<unknown>): Promise<unknown> {
  const stub = getDurableObjectStub()
  if (!stub)
    return await fallback()
  // Forward the original request: the same route re-runs inside the DO,
  // executes the mutation, persists to KV and emits to local WS peers. Its
  // response (including h3 error responses) passes through unchanged.
  return await stub.fetch(toWebRequest(event))
}
