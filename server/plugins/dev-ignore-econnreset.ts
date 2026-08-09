import process from 'node:process'

/**
 * Dev-only guard for a known Nuxt 4 upstream issue:
 * refreshing the page can reset a connection while the dev server reads it,
 * producing an unhandled `ECONNRESET` rejection that crashes/restarts the dev
 * server (nuxt/cli#994, nuxt/nuxt#32669). The reset is expected client churn;
 * log it as a warning instead of letting the process die. Production is
 * untouched: the handler only attaches in dev.
 */
export default defineNitroPlugin(() => {
  if (!import.meta.dev)
    return

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    if (message.includes('ECONNRESET')) {
      console.warn('[dev] Ignored ECONNRESET from a reset client connection')
      return
    }
    console.error('[dev] Unhandled rejection', reason)
  })
})
