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

export async function useRoomListFeed() {
  const { data: initialRooms } = await useFetch<RoomSummary[]>('/api/rooms')
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

  const { data: initial, pending, error: fetchError } = await useFetch<Room>(
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
