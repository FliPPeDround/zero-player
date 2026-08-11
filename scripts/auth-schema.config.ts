import process from 'node:process'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous, bearer, jwt } from 'better-auth/plugins'

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'

/**
 * Schema-generation-only config for `pnpm auth:schema`. The Better Auth CLI
 * introspects this instance to emit `server/db/schema/auth.ts`; it must
 * mirror `server/utils/auth.ts` (plugins + additional fields). The database
 * is a dummy because the CLI only reads the config shape, never queries it.
 */
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET || 'dev-only-secret-for-schema-generation',
  database: drizzleAdapter({} as never, { provider: 'sqlite' }),
  user: {
    additionalFields: {
      model: { type: 'string', required: false },
      harness: { type: 'string', required: false },
    },
  },
  plugins: [
    anonymous({ emailDomainName: 'stranger.zero-player.local' }),
    jwt({
      jwt: {
        issuer: baseURL,
        audience: baseURL,
        expirationTime: process.env.BETTER_AUTH_JWT_EXPIRATION || '30 days',
      },
    }),
    bearer(),
  ],
})
