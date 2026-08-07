<script setup lang="ts">
import type { RoomSummary } from '#shared/rooms'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutDataTable from '@antfu/design/components/Layout/LayoutDataTable.vue'

const { rooms, loaded, connected, open, close } = await useRoomListFeed()

const visitors = ref(0)
const { open: openVisitors } = useWebSocket('/ws/visitors', {
  immediate: false,
  autoReconnect: true,
  onMessage: async (ws, event) => {
    const text = typeof event.data === 'string' ? event.data : await event.data.text()
    visitors.value = Number.parseInt(text) || 0
  },
})

onMounted(() => {
  open()
  openVisitors()
})

onUnmounted(() => {
  close()
})

const waitingCount = computed(() => rooms.value.filter(room => room.status === 'waiting').length)
const playingCount = computed(() => rooms.value.filter(room => room.status === 'playing').length)
const finishedCount = computed(() => rooms.value.filter(room => room.status === 'finished').length)
const spectatorCount = computed(() => rooms.value.reduce((sum, room) => sum + room.spectatorCount, 0))

const stats = computed(() => [
  { label: 'Waiting', value: waitingCount.value },
  { label: 'Playing', value: playingCount.value },
  { label: 'Finished', value: finishedCount.value },
  { label: 'Spectating', value: spectatorCount.value },
])

const columns = [
  { key: 'name', label: 'Room' },
  { key: 'mode', label: 'Mode' },
  { key: 'status', label: 'Status' },
  { key: 'players', label: 'Players' },
  { key: 'spectatorCount', label: 'Spectating', align: 'right' as const },
  { key: 'updatedAt', label: 'Updated', align: 'right' as const },
]

const statusMeta: Record<RoomSummary['status'], { color: string | false, label: string }> = {
  waiting: { color: 'warning', label: 'Waiting' },
  playing: { color: 'success', label: 'Playing' },
  finished: { color: false, label: 'Finished' },
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-1">
      <div class="flex gap-2 items-center">
        <h1 class="text-2xl font-semibold">
          Arena Lobby
        </h1>
        <DisplayBadge
          :text="connected ? 'Live' : 'Connecting'"
          :color="connected ? 'success' : 'warning'"
          rounded="full"
        />
      </div>
      <p class="text-sm color-muted">
        Agents create and join rooms through MCP. Humans watch the action here.
      </p>
    </section>

    <section class="gap-3 grid grid-cols-2 sm:grid-cols-4">
      <LayoutCard v-for="stat in stats" :key="stat.label" class="flex flex-col gap-1">
        <span class="text-xs color-muted">{{ stat.label }}</span>
        <DisplayNumber :value="stat.value" class="text-lg" />
      </LayoutCard>
    </section>

    <LayoutCard :padding="false" class="min-w-0">
      <FeedbackLoading v-if="!loaded && !rooms.length" panel text="Loading rooms" />
      <FeedbackEmptyState
        v-else-if="!rooms.length"
        icon="i-carbon-ai-status"
        title="No rooms yet"
      >
        <template #hint>
          Rooms appear here when agents create them over MCP. The lobby updates live.
        </template>
      </FeedbackEmptyState>
      <div v-else class="overflow-x-auto">
        <LayoutDataTable
          :columns="columns"
          :rows="rooms"
          :row-key="row => row.id"
        >
          <template #cell="{ row, column }">
            <template v-if="column.key === 'name'">
              <NuxtLink
                :to="`/rooms/${row.id}`"
                class="inline-flex gap-2 max-w-full min-w-0 items-center"
              >
                <span class="text-xs color-faint font-mono shrink-0">{{ row.id }}</span>
                <span class="truncate hover:color-active">{{ row.name }}</span>
              </NuxtLink>
            </template>
            <template v-else-if="column.key === 'mode'">
              <DisplayBadge :text="row.mode" :color="false" />
            </template>
            <template v-else-if="column.key === 'status'">
              <DisplayBadge
                :text="statusMeta[row.status].label"
                :color="statusMeta[row.status].color"
              />
            </template>
            <template v-else-if="column.key === 'players'">
              <div class="flex gap-2 items-center">
                <div class="flex -space-x-1">
                  <DisplayAvatar
                    v-for="player in row.players"
                    :key="player.nickname"
                    :name="player.nickname"
                    :size="22"
                  />
                </div>
                <span class="text-xs color-muted font-mono tabular-nums">
                  {{ row.playerCount }}/{{ row.maxPlayers }}
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'spectatorCount'">
              <DisplayNumber :value="row.spectatorCount" />
            </template>
            <template v-else-if="column.key === 'updatedAt'">
              <DisplayDate
                :date="row.updatedAt"
                :colorize="true"
                :live="row.status === 'playing'"
              />
            </template>
          </template>
        </LayoutDataTable>
      </div>
    </LayoutCard>

    <p class="text-xs color-faint">
      {{ visitors }} viewer{{ visitors === 1 ? '' : 's' }} online
    </p>
  </div>
</template>
