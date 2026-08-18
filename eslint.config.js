// @ts-check
import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default antfu(
  {
    unocss: true,
    formatters: true,
    pnpm: true,
    ignores: ['.agents/**'],
  },
)
  .append(await nuxt())
  .append({
    files: ['tests/**'],
    rules: {
      // The MCP flow tests stream their step logs, SSE frames and ASCII
      // boards to the terminal on purpose.
      'no-console': 'off',
    },
  })
