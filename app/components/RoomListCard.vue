<script setup lang="ts">
import type { RoomSummary } from '#shared/rooms'
import { getGameName } from '#shared/games'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutPanelGrids from '@antfu/design/components/Layout/LayoutPanelGrids.vue'
import LayoutTabs from '@antfu/design/components/Layout/LayoutTabs.vue'

const props = defineProps<{
  rooms: RoomSummary[]
  loaded: boolean
  connected: boolean
}>()

const PAGE_SIZE = 12

const search = ref('')
const statusFilter = ref<'all' | RoomSummary['status']>('all')

const waitingCount = computed(() => props.rooms.filter(room => room.status === 'waiting').length)
const playingCount = computed(() => props.rooms.filter(room => room.status === 'playing').length)
const finishedCount = computed(() => props.rooms.filter(room => room.status === 'finished').length)
const abortedCount = computed(() => props.rooms.filter(room => room.status === 'aborted').length)

const statusTabs = computed(() => [
  { value: 'all', label: 'All', count: props.rooms.length },
  { value: 'waiting', label: 'Waiting', count: waitingCount.value },
  { value: 'playing', label: 'Playing', count: playingCount.value },
  { value: 'finished', label: 'Finished', count: finishedCount.value },
  { value: 'aborted', label: 'Aborted', count: abortedCount.value },
])

const filteredRooms = computed(() => {
  const query = search.value.trim().toLowerCase()
  return props.rooms.filter((room) => {
    if (statusFilter.value !== 'all' && room.status !== statusFilter.value)
      return false
    if (!query)
      return true
    return [
      room.name,
      room.id,
      room.gameId,
      getGameName(room.gameId),
      ...room.players.map(player => player.nickname),
    ].some(value => value.toLowerCase().includes(query))
  })
})

const visibleCount = ref(PAGE_SIZE)
const visibleRooms = computed(() => filteredRooms.value.slice(0, visibleCount.value))

const { isLoading, reset } = useInfiniteScroll(
  () => (import.meta.client ? document : null),
  () => {
    visibleCount.value = Math.min(filteredRooms.value.length, visibleCount.value + PAGE_SIZE)
  },
  {
    distance: 600,
    canLoadMore: () => visibleCount.value < filteredRooms.value.length,
  },
)

watch([search, statusFilter], () => {
  visibleCount.value = PAGE_SIZE
  reset()
})
</script>

<template>
  <LayoutCard :padding="false" class="min-w-0 overflow-hidden">
    <div class="px-4 py-3 border-b border-base flex flex-wrap gap-3 items-center justify-between">
      <div class="flex flex-wrap gap-2 items-center">
        <h2 class="text-sm font-medium">
          Rooms
        </h2>
        <DisplayNumberBadge :value="filteredRooms.length" />
        <DisplayBadge
          :text="connected ? 'Live' : 'Connecting'"
          :color="connected ? 'success' : 'warning'"
          :icon="connected ? 'i-carbon-radio-button' : 'i-carbon-satellite'"
          rounded="full"
          class="text-mini"
        />
      </div>
      <FormSearchField v-model="search" placeholder="Search rooms" size="sm" class="w-56" />
    </div>
    <LayoutTabs v-model="statusFilter" :tabs="statusTabs" variant="segment" class="p-2" />
    <div class="border-t border-base">
      <FeedbackLoading v-if="!loaded && !rooms.length" panel text="Loading rooms" />
      <LayoutPanelGrids
        v-else-if="!filteredRooms.length"
        variant="dots"
        :size="18"
      >
        <FeedbackEmptyState
          icon="i-carbon-search"
          :title="rooms.length ? 'No matching rooms' : 'No rooms yet'"
        >
          <template #hint>
            <template v-if="rooms.length">
              Try a different status or search term.
            </template>
            <template v-else>
              Rooms appear here when agents create them over MCP. The lobby updates live.
            </template>
          </template>
        </FeedbackEmptyState>
      </LayoutPanelGrids>
      <div v-else class="p-4 gap-3 grid grid-cols-1 items-start lg:grid-cols-3 sm:grid-cols-2">
        <RoomCard
          v-for="room in visibleRooms"
          :key="room.id"
          :room="room"
        />
      </div>
      <div
        v-if="isLoading || visibleRooms.length < filteredRooms.length"
        class="py-4 flex items-center justify-center"
      >
        <FeedbackSpinner class="text-faint" />
      </div>
    </div>
  </LayoutCard>
</template>
