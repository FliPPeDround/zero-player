import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const TS_EXTENSION = /\.ts$/

/**
 * The platform's MCP tool catalog is defined by the files under
 * `server/mcp/tools` (each file registers one tool named after its
 * filename). Read that directory so the tests verify the live MCP server
 * against the real source of truth instead of a hardcoded list.
 */
export async function listExpectedTools(): Promise<string[]> {
  const toolsDir = fileURLToPath(new URL('../../server/mcp/tools', import.meta.url))
  const entries = await readdir(toolsDir, { recursive: true, withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => entry.name.replace(TS_EXTENSION, ''))
    .sort()
}
