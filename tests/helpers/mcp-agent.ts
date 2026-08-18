import type { McpToolMeta } from './log'

import process from 'node:process'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { printCall } from './log'

const TRAILING_SLASH = /\/+$/

/** MCP endpoint of a Zero Player origin, e.g. `http://localhost:3001/mcp`. */
export function resolveMcpUrl(origin?: string): string {
  const base = origin ?? process.env.ZP_ORIGIN ?? 'http://localhost:3001'
  return `${base.replace(TRAILING_SLASH, '')}/mcp`
}

/**
 * A simulated AI agent speaking the real MCP protocol to the platform's
 * external `/mcp` endpoint. Wraps the official MCP client SDK so the test
 * exercises the exact same interface an agent would use: login for a token,
 * then stateful tool calls that echo the token back.
 */
export class McpAgent {
  readonly label: string

  private readonly client: Client
  private readonly transport: StreamableHTTPClientTransport
  private token: string | undefined
  private readonly toolCatalog = new Map<string, McpToolMeta>()

  private constructor(label: string, origin: string) {
    this.label = label
    this.transport = new StreamableHTTPClientTransport(
      new URL(resolveMcpUrl(origin)),
      {
        requestInit: {
          headers: {
            // The server reads the user-agent header as the agent harness.
            'user-agent': 'vitest-e2e',
          },
        },
      },
    )
    this.client = new Client(
      { name: 'vitest-e2e', version: '1.0.0' },
      { enforceStrictCapabilities: false },
    )
  }

  static async connect(label: string, origin?: string): Promise<McpAgent> {
    const agent = new McpAgent(label, origin ?? process.env.ZP_ORIGIN ?? 'http://localhost:3001')
    await agent.client.connect(agent.transport)
    await agent.ensureTools()
    return agent
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  /** Log in as an agent persona and keep the minted token for later calls. */
  async login(model: string, nickname: string): Promise<void> {
    const data = await this.call<{ token: string }>('login', { model, nickname })
    this.token = data.token
  }

  get hasToken(): boolean {
    return this.token !== undefined
  }

  /** The short login token echoed by the server, once logged in. */
  get tokenValue(): string | undefined {
    return this.token
  }

  /** Restore a login token saved by an earlier chain step run. */
  setToken(token: string): void {
    this.token = token
  }

  /** Drop the token, e.g. when a full run resets the chain. */
  clearToken(): void {
    this.token = undefined
  }

  async listTools(): Promise<string[]> {
    await this.ensureTools()
    return [...this.toolCatalog.keys()]
  }

  /**
   * Call an MCP tool, automatically attaching the login token to stateful
   * calls. The tool result text is a JSON payload from this platform's MCP
   * tools; it is parsed and returned. Tool-level errors throw with the
   * server's message.
   */
  async call<T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const merged = name === 'login' || !this.token
      ? { ...args }
      : { ...args, token: this.token }

    const result = await this.client.callTool({ name, arguments: merged })
    const text = result.content
      ?.filter(block => block.type === 'text')
      .map(block => block.text)
      .join('') ?? ''

    if (result.isError)
      throw new Error(`[${this.label}] ${name} failed: ${text}`)

    let data: Record<string, unknown>
    try {
      data = JSON.parse(text) as Record<string, unknown>
    }
    catch {
      data = { raw: text }
    }
    const { token: _token, ...visibleArgs } = merged
    printCall(
      this.label,
      name,
      visibleArgs,
      data,
      this.toolCatalog.get(name),
      name === 'login' ? undefined : this.token,
    )
    return data as T
  }

  /**
   * Load the tool catalog once after connecting, so every call log can show
   * the tool's description and JSON input schema.
   */
  private async ensureTools(): Promise<void> {
    if (this.toolCatalog.size > 0)
      return
    const { tools } = await this.client.listTools()
    for (const tool of tools)
      this.toolCatalog.set(tool.name, { description: tool.description, inputSchema: tool.inputSchema })
  }
}
