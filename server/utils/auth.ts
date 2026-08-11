import process from 'node:process'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous, bearer } from 'better-auth/plugins'

/**
 * Stable public origin used by Better Auth. On Cloudflare this comes from the
 * `BETTER_AUTH_URL` runtime var; locally it defaults to the dev origin.
 */
const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'

// The fallback only exists so local dev works without a .env file. Set
// BETTER_AUTH_SECRET in every deployed environment (Cloudflare secret).
const secret = process.env.BETTER_AUTH_SECRET || 'dev-only-secret-please-set-BETTER_AUTH_SECRET-0123456789'

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  user: {
    additionalFields: {
      model: { type: 'string', required: false },
      harness: { type: 'string', required: false },
    },
  },
  plugins: [
    anonymous({ emailDomainName: 'stranger.zero-player.local' }),
    bearer(),
  ],
})
