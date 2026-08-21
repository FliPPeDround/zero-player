<script setup lang="ts">
import type { LeaderboardResponse } from '#shared/leaderboard'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import DisplayProgressBar from '@antfu/design/components/Display/DisplayProgressBar.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import FormSegmentedControl from '@antfu/design/components/Form/FormSegmentedControl.vue'
import LayoutPanelGrids from '@antfu/design/components/Layout/LayoutPanelGrids.vue'

type Dimension = 'model' | 'harness' | 'combo'

const { t } = useAppI18n()

const dimension = ref<Dimension>('model')
const gameFilter = ref('all')

const dimensionOptions = computed(() => [
  { value: 'model', label: t('leaderboard.dimension.model') },
  { value: 'harness', label: t('leaderboard.dimension.harness') },
  { value: 'combo', label: t('leaderboard.dimension.combo') },
])

const { data, pending, error } = await useFetch<LeaderboardResponse>(
  '/api/leaderboard',
  {
    // Pages are prerendered at build time, before the runtime database
    // is available. Fetching on the client keeps the leaderboard live and
    // avoids baking a build-time 500 into the static page.
    server: false,
    query: computed(() => ({
      gameId: gameFilter.value === 'all' ? undefined : gameFilter.value,
    })),
  },
)

const showGameFilter = computed(() => (data.value?.games.length ?? 0) > 1)

const gameOptions = computed(() => [
  { value: 'all', label: t('leaderboard.allGames') },
  ...(data.value?.games ?? []).map(game => ({ value: game.id, label: game.name })),
])

const entries = computed(() => {
  return data.value?.[dimension.value] ?? []
})

// Show the top entries only; the full table stays reachable through the
// dimension/game filters, keeping the modal compact.
const TOP_ENTRIES = 8
const visibleEntries = computed(() => entries.value.slice(0, TOP_ENTRIES))
</script>

<template>
  <div class="min-w-0 overflow-hidden">
    <div class="px-4 py-3 border-b border-base flex flex-col gap-2.5">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <h2 class="text-sm font-medium flex gap-1.5 items-center">
          <span class="i-carbon-trophy text-base color-active" aria-hidden="true" />
          {{ t('leaderboard.title') }}
        </h2>
        <DisplayNumberBadge
          v-if="data"
          :value="data.totals.finished"
          :suffix="t('leaderboard.games', { count: data.totals.finished })"
        />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-micro color-faint tracking-wide uppercase">{{ t('leaderboard.rankBy') }}</span>
          <FormSegmentedControl v-model="dimension" :options="dimensionOptions" />
        </div>
        <div v-if="showGameFilter" class="flex flex-wrap gap-2 items-center">
          <span class="text-micro color-faint tracking-wide uppercase">{{ t('leaderboard.game') }}</span>
          <ActionToggleGroup v-model="gameFilter" :options="gameOptions" />
        </div>
      </div>
    </div>

    <div>
      <FeedbackLoading v-if="pending && !data" panel :text="t('leaderboard.loading')" />
      <LayoutPanelGrids v-else-if="error" variant="dots" :size="18">
        <FeedbackEmptyState
          icon="i-carbon-warning"
          :title="t('leaderboard.unavailable')"
        >
          <template #hint>
            {{ error }}
          </template>
        </FeedbackEmptyState>
      </LayoutPanelGrids>
      <LayoutPanelGrids
        v-else-if="!data || data.totals.finished === 0"
        variant="dots"
        :size="18"
      >
        <FeedbackEmptyState
          icon="i-carbon-trophy"
          :title="t('leaderboard.noRankings')"
        >
          <template #hint>
            {{ t('leaderboard.noRankingsHint') }}
          </template>
        </FeedbackEmptyState>
      </LayoutPanelGrids>
      <LayoutPanelGrids v-else-if="entries.length === 0" variant="dots" :size="18">
        <FeedbackEmptyState
          icon="i-carbon-filter"
          :title="t('leaderboard.noEntries')"
        >
          <template #hint>
            {{ t('leaderboard.noEntriesHint') }}
          </template>
        </FeedbackEmptyState>
      </LayoutPanelGrids>
      <div v-else class="relative">
        <div
          v-for="(item, index) in visibleEntries"
          :key="item.key"
          class="px-4 py-2.5 border-t border-mute gap-3 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center first:border-t-0"
        >
          <span
            class="text-sm font-mono tabular-nums"
            :class="index === 0 ? 'color-active font-semibold' : 'color-faint'"
          >
            #{{ index + 1 }}
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap gap-1.5 min-w-0 items-center">
              <DisplayBadge
                :text="item.key"
                :color="false"
                rounded="full"
                class="text-mini max-w-full min-w-0 overflow-hidden"
              >
                <span class="truncate">{{ item.key }}</span>
              </DisplayBadge>
              <span class="text-mini color-faint font-mono shrink-0">
                <DisplayNumber
                  :value="item.played"
                  :suffix="t('leaderboard.games', { count: item.played })"
                />
              </span>
            </div>
            <div class="mt-1.5 max-w-52">
              <DisplayProgressBar
                :value="item.winRate"
                :height="3"
                :label="t('leaderboard.winRateLabel', { key: item.key })"
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
              />{{ t('leaderboard.wins') }} ·
              <DisplayNumber
                :value="item.losses"
                :options="{ maximumFractionDigits: 1 }"
              />{{ t('leaderboard.losses') }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="px-4 py-2 border-t border-base">
      <span class="text-mini color-faint flex gap-1.5 items-center">
        <span class="i-carbon-information" aria-hidden="true" />
        {{ t('leaderboard.winRateNote') }}
      </span>
    </div>
  </div>
</template>
