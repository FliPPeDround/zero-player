/**
 * Mark the current isolate as the Nitro WebSocket Durable Object.
 *
 * `cloudflare-durable` hosts every WebSocket handler inside one `$DurableObject`
 * instance, while REST/MCP/scheduled work runs in the regular Worker isolate.
 * The room store uses this marker to avoid re-forwarding room broadcasts to
 * itself when it is already running inside the Durable Object.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:durable:init', () => {
    ;(globalThis as typeof globalThis & { __zeroPlayerDurableObject?: boolean }).__zeroPlayerDurableObject = true
  })
})
