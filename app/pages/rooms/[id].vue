<script setup lang="ts">
import type { RoomEvent } from '#shared/rooms'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const route = useRoute()
const roomId = computed(() => String(route.params.id ?? ''))
const { room, pending, error, connected, open, close } = await useRoomDetailFeed(roomId)

onMounted(open)
onUnmounted(close)

const statusMeta = {
  waiting: { color: 'warning', label: 'Waiting' },
  playing: { color: 'success', label: 'Playing' },
  finished: { color: false, label: 'Finished' },
} as const

const eventMeta: Record<RoomEvent['type'], { color: string | false, label: string }> = {
  player_joined: { color: 'success', label: 'Joined' },
  player_left: { color: 'warning', label: 'Left' },
  game_started: { color: 'primary', label: 'Started' },
  move: { color: 'blue', label: 'Move' },
  game_finished: { color: false, label: 'Finished' },
}

const players = computed(() => {
  const list = room.value?.players ?? []
  return {
    red: list.find(player => player.slot === 'red') ?? null,
    blue: list.find(player => player.slot === 'blue') ?? null,
  }
})

const logRef = ref<HTMLElement | null>(null)
watch(() => room.value?.events.length, () => {
  nextTick(() => {
    if (logRef.value)
      logRef.value.scrollTop = logRef.value.scrollHeight
  })
})

useHead({
  title: computed(() => room.value ? `${room.value.name} · Zero Player` : 'Room · Zero Player'),
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex gap-3 items-center">
      <NuxtLink to="/" class="btn-action shrink-0" aria-label="Back to lobby">
        <span class="i-carbon-arrow-left" aria-hidden="true" />
        <span class="hidden sm:inline">Lobby</span>
      </NuxtLink>
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-semibold truncate">
          {{ room?.name ?? 'Room' }}
        </h1>
        <div class="text-xs color-muted flex gap-2 items-center">
          <span class="font-mono">{{ room?.id }}</span>
          <DisplayBadge v-if="room" :text="room.mode" :color="false" />
          <DisplayBadge
            v-if="room"
            :text="statusMeta[room.status].label"
            :color="statusMeta[room.status].color"
          />
        </div>
      </div>
      <div v-if="room" class="flex shrink-0 gap-3 items-center">
        <span class="text-xs color-muted flex gap-1 items-center">
          <span class="i-carbon-video" aria-hidden="true" />
          <DisplayNumber :value="room.spectatorCount" />
        </span>
        <DisplayBadge
          :text="connected ? 'Live' : 'Connecting'"
          :color="connected ? 'success' : 'warning'"
          rounded="full"
        />
      </div>
    </div>

    <FeedbackLoading v-if="pending && !room" panel text="Loading room" />
    <FeedbackEmptyState
      v-else-if="error"
      icon="i-carbon-warning"
      title="Room unavailable"
    >
      <template #hint>
        {{ error }}
      </template>
    </FeedbackEmptyState>

    <template v-else-if="room">
      <section class="gap-3 grid items-stretch md:grid-cols-[1fr_auto_1fr]">
        <RoomPlayerCard
          v-for="side in (['red', 'blue'] as const)"
          :key="side"
          :player="players[side]"
          :side="side"
        />
        <div class="text-sm color-faint font-mono flex items-center justify-center">
          VS
        </div>
      </section>

      <section v-if="room.status === 'finished'" class="flex justify-center">
        <DisplayBadge
          :text="room.winner ? `${room.winner} wins` : 'Draw'"
          :color="room.winner ? 'success' : false"
          variant="solid"
          rounded="full"
          class="text-sm px-3 py-1.5"
        />
      </section>

      <section class="gap-4 grid lg:grid-cols-[minmax(0,300px)_1fr]">
        <LayoutCard class="flex flex-col gap-3 h-fit">
          <h2 class="text-sm color-muted font-medium">
            Match info
          </h2>
          <div class="text-sm flex gap-3 items-center justify-between">
            <span class="color-muted">Created</span>
            <DisplayDate :date="room.createdAt" />
          </div>
          <div
            v-if="room.startedAt"
            class="text-sm flex gap-3 items-center justify-between"
          >
            <span class="color-muted">Started</span>
            <DisplayDate :date="room.startedAt" />
          </div>
          <div
            v-if="room.finishedAt"
            class="text-sm flex gap-3 items-center justify-between"
          >
            <span class="color-muted">Finished</span>
            <DisplayDate :date="room.finishedAt" />
          </div>
        </LayoutCard>

        <LayoutCard :padding="false" class="min-w-0">
          <div class="px-4 py-2 border-b border-base flex items-center justify-between">
            <h2 class="text-sm font-medium">
              Battle log
            </h2>
            <DisplayBadge
              v-if="room.status === 'playing'"
              text="Live"
              color="success"
              rounded="full"
            />
          </div>
          <div ref="logRef" class="no-scrollbar h-[420px] overflow-y-auto">
            <ol v-if="room.events.length" class="py-1">
              <li
                v-for="event in room.events"
                :key="event.id"
                class="text-sm px-4 py-2 border-b border-mute flex gap-3 items-start last:border-0"
              >
                <DisplayBadge
                  :text="eventMeta[event.type].label"
                  :color="eventMeta[event.type].color"
                  rounded="full"
                  class="mt-0.5 shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex gap-2 items-baseline justify-between">
                    <span class="font-medium truncate">
                      {{ event.actor ?? eventMeta[event.type].label }}
                    </span>
                    <DisplayDate
                      :date="event.at"
                      :live="room.status === 'playing'"
                      class="text-xs shrink-0"
                    />
                  </div>
                  <div
                    v-if="event.type === 'move' && event.payload"
                    class="text-xs color-muted font-mono mt-0.5"
                  >
                    {{ event.payload.move }}
                    · power {{ event.payload.power }}
                    · score {{ event.payload.score }}
                  </div>
                  <div
                    v-else-if="event.type === 'game_finished'"
                    class="text-xs color-muted font-mono mt-0.5"
                  >
                    {{ room.winner ?? 'Draw' }}
                  </div>
                </div>
              </li>
            </ol>
            <FeedbackEmptyState
              v-else
              icon="i-carbon-activity"
              title="No events yet"
            />
          </div>
        </LayoutCard>
      </section>
    </template>
  </div>
</template>
