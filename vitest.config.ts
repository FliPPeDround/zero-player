import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The whole point of these flows is observability: let step logs, SSE
    // frames and ASCII boards stream straight to the terminal.
    disableConsoleIntercept: true,
    // MCP E2E flows share one live dev server and the room lobby, so test
    // files must run one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
