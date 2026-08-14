import type {
  Room,
  RoomDetailSocketMessage,
  RoomListSocketMessage,
  RoomSummary,
} from '#shared/rooms'

/**
 * Bounded reconnect with exponential backoff. A room page whose room no
 * longer exists would otherwise reconnect forever, burning one request every
 * few seconds per stale tab.
 */
export const wsAutoReconnect = {
  retries: 6,
  delay: (retried: number) => Math.min(1000 * 2 ** (retried - 1), 15_000),
}

function parseSocketData(data: unknown): Promise<string> {
  if (typeof data === 'string')
    return Promise.resolve(data)
  if (data instanceof Blob)
    return data.text()
  return Promise.resolve(String(data))
}

const FALLBACK_POLL_INTERVAL_MS = 5000

/**
 * While the WebSocket feed is temporarily unavailable, poll the REST endpoint
 * on a short interval so the page keeps updating. The poller starts when the
 * socket is disconnected and stops as soon as it reconnects or the feed
 * reaches a terminal state.
 */
function watchFallbackPolling(connected: Ref<boolean>, poll: () => void, shouldStop?: () => boolean): void {
  let timer: ReturnType<typeof setInterval> | null = null
  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  watch([connected, () => shouldStop?.() ?? false], ([isConnected, isStopped]) => {
    if (!import.meta.client)
      return
    if (isConnected || isStopped) {
      stop()
      return
    }
    if (!timer) {
      timer = setInterval(() => {
        poll()
      }, FALLBACK_POLL_INTERVAL_MS)
    }
  }, { immediate: true })
  onScopeDispose(stop)
}

export async function useRoomListFeed() {
  const { data: initialRooms, refresh } = await useFetch<RoomSummary[]>('/api/rooms')
  const rooms = ref<RoomSummary[]>(initialRooms.value ?? [])
  const loaded = ref(true)
  const connected = ref(false)

  const { open, close } = useWebSocket('/ws/rooms', {
    immediate: false,
    autoReconnect: wsAutoReconnect,
    onConnected: () => {
      connected.value = true
    },
    onDisconnected: () => {
      connected.value = false
    },
    onMessage: async (ws, event) => {
      const message = JSON.parse(await parseSocketData(event.data)) as RoomListSocketMessage

      if (message.type === 'snapshot') {
        rooms.value = message.rooms
        loaded.value = true
      }
      else if (message.type === 'created' || message.type === 'updated') {
        const index = rooms.value.findIndex(room => room.id === message.room.id)
        if (index === -1)
          rooms.value.unshift(message.room)
        else
          rooms.value[index] = message.room
      }
      else if (message.type === 'deleted') {
        rooms.value = rooms.value.filter(room => room.id !== message.room.id)
      }
    },
  })

  // While the WebSocket is down, keep the lobby fresh by polling the REST
  // endpoint instead.
  watchFallbackPolling(connected, () => {
    refresh().catch(() => {})
  })

  return {
    rooms,
    loaded,
    connected,
    open,
    close,
  }
}

export async function useRoomDetailFeed(roomId: MaybeRefOrGetter<string>) {
  const id = computed(() => String(toValue(roomId)))
  const connected = ref(false)
  const error = ref<string | null>(null)
  const closed = ref(false)

  const { data: initial, pending, error: fetchError, refresh } = await useFetch<Room>(
    computed(() => `/api/rooms/${encodeURIComponent(id.value)}`),
    { immediate: true },
  )

  const room = ref<Room | null>(initial.value ?? null)

  watch(initial, (value) => {
    if (value)
      room.value = value
  }, { immediate: true })

  watch(fetchError, (value) => {
    if (value)
      error.value = value.message
  }, { immediate: true })

  const { open, close } = useWebSocket(
    computed(() => `/ws/rooms/${encodeURIComponent(id.value)}`),
    {
      immediate: false,
      autoReconnect: wsAutoReconnect,
      onConnected: () => {
        connected.value = true
      },
      onDisconnected: () => {
        connected.value = false
      },
      onMessage: async (ws, event) => {
        const message = JSON.parse(await parseSocketData(event.data)) as RoomDetailSocketMessage
        if (message.type === 'error') {
          error.value = message.message
          if (message.code === 'room_not_found')
            close()
          return
        }
        if (message.type === 'closed') {
          room.value = message.room
          error.value = null
          closed.value = true
          close()
          return
        }
        room.value = message.room
        error.value = null
        closed.value = false
      },
    },
  )

  // While the WebSocket is down, keep the board fresh by polling REST.
  watchFallbackPolling(connected, () => {
    refresh().catch(() => {})
  }, () => closed.value)

  return {
    room,
    pending,
    error,
    closed,
    connected,
    open,
    close,
  }
}
