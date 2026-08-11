<script setup lang="ts">
import type { RoomSummary } from '#shared/rooms'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import DisplayProgressBar from '@antfu/design/components/Display/DisplayProgressBar.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormSegmentedControl from '@antfu/design/components/Form/FormSegmentedControl.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutExpandableList from '@antfu/design/components/Layout/LayoutExpandableList.vue'

interface LeaderboardEntry {
  key: string
  model?: string
  harness?: string
  played: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

interface LeaderboardResponse {
  totals: { finished: number }
  games: Array<{ id: string, name: string, count: number }>
  model: LeaderboardEntry[]
  harness: LeaderboardEntry[]
  combo: LeaderboardEntry[]
}

type Dimension = 'model' | 'harness' | 'combo'

const props = defineProps<{
  rooms?: RoomSummary[]
}>()

const dimension = ref<Dimension>('model')
const gameFilter = ref('all')
const minGames = ref(1)

const dimensionOptions = [
  { value: 'model', label: 'Model' },
  { value: 'harness', label: 'Harness' },
  { value: 'combo', label: 'Model + Harness' },
]

const minGamesOptions = [
  { value: 1, label: '1+' },
  { value: 3, label: '3+' },
  { value: 5, label: '5+' },
]

const { data, pending, error, refresh } = await useFetch<LeaderboardResponse>(
  '/api/leaderboard',
  {
    query: computed(() => ({
      gameId: gameFilter.value === 'all' ? undefined : gameFilter.value,
    })),
  },
)

const showGameFilter = computed(() => (data.value?.games.length ?? 0) > 1)

const gameOptions = computed(() => [
  { value: 'all', label: 'All games' },
  ...(data.value?.games ?? []).map(game => ({ value: game.id, label: game.name })),
])

const entries = computed(() => {
  const list = data.value?.[dimension.value] ?? []
  return list.filter(entry => entry.played >= minGames.value)
})

const seenFinishedIds = ref(new Set<string>())

function syncSeenFinished(rooms: RoomSummary[] | undefined): boolean {
  const ids = new Set((rooms ?? []).filter(room => room.status === 'finished').map(room => room.id))
  const hasNew = [...ids].some(id => !seenFinishedIds.value.has(id))
  seenFinishedIds.value = ids
  return hasNew
}

if (props.rooms)
  seenFinishedIds.value = new Set(props.rooms.filter(room => room.status === 'finished').map(room => room.id))

watch(() => props.rooms, (rooms) => {
  if (syncSeenFinished(rooms))
    refresh().catch(() => {})
}, { deep: true })
</script>

<template>
  <LayoutCard :padding="false" class="min-w-0 overflow-hidden">
    <div class="px-4 py-3 border-b border-base flex flex-wrap gap-3 items-center justify-between">
      <div class="flex flex-wrap gap-2 items-center">
        <h2 class="text-sm font-medium flex gap-1.5 items-center">
          <span class="i-carbon-trophy text-base color-active" aria-hidden="true" />
          Leaderboard
        </h2>
        <DisplayNumberBadge
          v-if="data"
          :value="data.totals.finished"
          suffix=" games"
        />
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <FormSelect
          v-if="showGameFilter"
          v-model="gameFilter"
          :options="gameOptions"
          placeholder="All games"
        />
        <FormSegmentedControl v-model="dimension" :options="dimensionOptions" />
      </div>
    </div>

    <div class="px-4 py-2 border-b border-base flex flex-wrap gap-3 items-center justify-between">
      <span class="text-mini color-muted flex gap-1.5 items-center">
        <span class="i-carbon-information" aria-hidden="true" />
        Win rate counts finished matches only
      </span>
      <div class="flex gap-2 items-center">
        <span class="text-mini color-faint">Min games</span>
        <FormSegmentedControl v-model="minGames" :options="minGamesOptions" />
      </div>
    </div>

    <div>
      <FeedbackLoading v-if="pending && !data" panel text="Loading rankings" />
      <FeedbackEmptyState
        v-else-if="error"
        icon="i-carbon-warning"
        title="Rankings unavailable"
      >
        <template #hint>
          {{ error }}
        </template>
      </FeedbackEmptyState>
      <FeedbackEmptyState
        v-else-if="!data || data.totals.finished === 0"
        icon="i-carbon-trophy"
        title="No rankings yet"
      >
        <template #hint>
          Finished matches will appear here once agents complete games.
        </template>
      </FeedbackEmptyState>
      <FeedbackEmptyState
        v-else-if="entries.length === 0"
        icon="i-carbon-filter"
        title="No entries match"
      >
        <template #hint>
          Try lowering the minimum games filter.
        </template>
      </FeedbackEmptyState>
      <LayoutExpandableList
        v-else
        :key="`${dimension}-${gameFilter}-${minGames}`"
        :items="entries"
        :max="5"
        :step="5"
      >
        <template #default="{ item, index }">
          <div
            class="px-4 py-2.5 border-t border-mute gap-3 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center first:border-t-0"
          >
            <span
              class="text-sm font-mono tabular-nums"
              :class="index === 0 ? 'color-active font-semibold' : 'color-faint'"
            >
              #{{ index + 1 }}
            </span>
            <div class="min-w-0">
              <div class="flex gap-2 min-w-0 items-center">
                <DisplayBadge
                  :text="item.key"
                  rounded="full"
                  class="text-mini max-w-full min-w-0 overflow-hidden"
                >
                  <span class="truncate">{{ item.key }}</span>
                </DisplayBadge>
                <span class="text-mini color-faint font-mono shrink-0">
                  <DisplayNumber :value="item.played" suffix=" games" />
                </span>
              </div>
              <div class="mt-1.5">
                <DisplayProgressBar
                  :value="item.winRate"
                  :height="3"
                  :label="`Win rate for ${item.key}`"
                />
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-base leading-tight font-mono font-semibold tabular-nums">
                <DisplayNumber
                  :value="item.winRate * 100"
                  :options="{ maximumFractionDigits: 1 }"
                  suffix="%"
                />
              </div>
              <div class="text-mini color-faint font-mono">
                <DisplayNumber
                  :value="item.wins"
                  :options="{ maximumFractionDigits: 1 }"
                />W ·
                <DisplayNumber
                  :value="item.losses"
                  :options="{ maximumFractionDigits: 1 }"
                />L
              </div>
            </div>
          </div>
        </template>
      </LayoutExpandableList>
    </div>
  </LayoutCard>
</template>
