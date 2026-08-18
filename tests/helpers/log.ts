const STEP_LINE = '='.repeat(72)
const CALL_LINE = '-'.repeat(72)

export interface McpToolMeta {
  description?: string
  inputSchema?: unknown
}

/** Print a numbered/readable section header, e.g. `步骤 2 · 黑方创建房间`. */
export function step(title: string): void {
  console.log(`\n${STEP_LINE}`)
  console.log(`  ${title}`)
  console.log(`${STEP_LINE}`)
}

/**
 * Print one MCP tool call: request params (no token), a one-line scan of the
 * key fields, and the full parsed JSON the server returned.
 */
export function printCall(
  label: string,
  name: string,
  args: Record<string, unknown>,
  result: unknown,
  tool?: McpToolMeta,
  attachedToken?: string,
): void {
  const scan = scanLine(result as Record<string, unknown>)
  console.log(`\n${CALL_LINE}`)
  console.log(`[${label}] → ${name}`)
  console.log(`请求: ${JSON.stringify(args)}`)
  if (attachedToken)
    console.log(`携带 token: ${attachedToken.slice(0, 4)}…（已自动附加，日志隐藏完整值）`)
  if (tool?.description)
    console.log(`工具描述: ${tool.description}`)
  if (tool?.inputSchema)
    console.log(`输入 Schema:\n${stringifyReadable(tool.inputSchema)}`)
  if (scan)
    console.log(`关键: ${scan}`)
  console.log(CALL_LINE)
  console.log(`[${label}] ← ${name} 返回（完整 JSON）:`)
  console.log(stringifyReadable(result))
  console.log(CALL_LINE)
}

/** Print one SSE frame received from `GET /api/rooms/:id/events`. */
export function printSseFrame(label: string, at: Date, data: Record<string, unknown>): void {
  const scan = scanLine(data)
  console.log(`\n[SSE] ${label} · ${at.toLocaleTimeString()}${scan ? ` · ${scan}` : ''}`)
  console.log(stringifyReadable(data))
  console.log('')
}

/** One-line overview of the most useful fields for scanning the output. */
function scanLine(data: Record<string, unknown>): string {
  // Move-tool payloads carry game fields at the top level (`game` is only the
  // game id string); start-game/get-room nest them under `game`.
  const nested = typeof data.game === 'object' && data.game !== null
  const game = (nested ? data.game : data) as Record<string, unknown>
  const room = data.room as Record<string, unknown> | undefined
  const fields: Array<[string, unknown]> = [
    ['type', data.type],
    ['status', data.status ?? room?.status ?? game.status],
    ['players', room?.playerCount],
    ['readyCount', data.readyCount],
    ['moveNumber', game.moveNumber],
    ['lastMove', game.lastMove],
    ['yourSide', game.yourSide],
    ['currentPlayer', game.currentPlayer],
    ['winner', game.winner ?? data.winner],
    ['reason', game.reason ?? data.reason],
  ]
  return fields
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' · ')
}

/**
 * JSON renderer for terminal logs. Multi-line strings (e.g. ASCII boards)
 * are printed as indented blocks instead of one long escaped line, so the
 * payload stays complete but readable.
 */
function stringifyReadable(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth)
  const childIndent = '  '.repeat(depth + 1)

  if (value === null)
    return 'null'
  if (value === undefined)
    return 'undefined'
  if (typeof value === 'string') {
    if (value.includes('\n')) {
      const lines = value.split('\n')
      return `"${lines[0]}"\n${lines.slice(1).map(line => `${childIndent}${line}`).join('\n')}`
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0)
      return '[]'
    const items = value
      .map(item => `${childIndent}${stringifyReadable(item, depth + 1)}`)
      .join(',\n')
    return `[\n${items}\n${indent}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0)
      return '{}'
    const body = entries
      .map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${stringifyReadable(item, depth + 1)}`)
      .join(',\n')
    return `{\n${body}\n${indent}}`
  }
  return String(value)
}
