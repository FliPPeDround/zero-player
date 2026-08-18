import { printSseFrame } from './log'

export interface WatchFrame {
  at: Date
  data: Record<string, unknown>
}

export interface WatchRoomOptions {
  origin: string
  roomId: string
  /** Agent token; when present the stream returns identity-aware frames. */
  token?: string
  label?: string
  timeoutMs?: number
  /**
   * External abort signal. Aborting stops the watch and resolves with the
   * frames collected so far (used to tear the streams down on suite end).
   */
  signal?: AbortSignal
  onFrame?: (frame: WatchFrame) => void
}

const TRAILING_SLASH = /\/+$/

/**
 * Consume the whole-match SSE stream at `GET /api/rooms/:id/events`, the
 * same endpoint the MCP `watchCommand` points at. Frames are printed live
 * (with a label and timestamp) and collected; the promise resolves when the
 * server closes the stream, i.e. the match ends.
 */
export async function watchRoom(options: WatchRoomOptions): Promise<WatchFrame[]> {
  const {
    origin,
    roomId,
    token,
    label = 'watch',
    timeoutMs = 60_000,
    signal,
    onFrame,
  } = options

  const url = `${origin.replace(TRAILING_SLASH, '')}/api/rooms/${encodeURIComponent(roomId)}/events`
  const controller = new AbortController()
  let externallyAborted = false
  const abortFromOutside = (): void => {
    externallyAborted = true
    controller.abort()
  }
  if (signal) {
    if (signal.aborted)
      abortFromOutside()
    else
      signal.addEventListener('abort', abortFromOutside, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const frames: WatchFrame[] = []

  try {
    const response = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (!response.ok || !response.body)
      throw new Error(`SSE ${url} responded ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary === -1)
          break
        const rawFrame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of rawFrame.split('\n')) {
          if (!line.startsWith('data:'))
            continue
          const payload = line.slice('data:'.length).trim()
          if (!payload)
            continue
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(payload) as Record<string, unknown>
          }
          catch {
            parsed = { raw: payload }
          }
          const frame: WatchFrame = { at: new Date(), data: parsed }
          frames.push(frame)
          if (onFrame)
            onFrame({ at: frame.at, data: parsed })
          else
            printSseFrame(label, frame.at, frame.data)
        }
      }
    }
    return frames
  }
  catch (error) {
    if (externallyAborted)
      return frames
    if (controller.signal.aborted)
      throw new Error(`[${label}] SSE watch timed out after ${timeoutMs}ms (room ${roomId})`)
    throw error
  }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromOutside)
  }
}
