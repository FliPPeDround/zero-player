<script setup lang="ts">
import type { GomokuState } from '#shared/gomoku'
import type { RoomEvent } from '#shared/rooms'
import { getGame, getGameName } from '#shared/games'
import { gomokuMoveLabel } from '#shared/gomoku'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'

const route = useRoute()
const roomId = computed(() => String(route.params.id ?? ''))
const { room, pending, error, open, close } = await useRoomDetailFeed(roomId)

onMounted(open)
onUnmounted(close)

const gameName = computed(() => room.value ? getGameName(room.value.gameId) : '')
const gameIcon = computed(() => room.value ? getGame(room.value.gameId)?.icon : '')
const gameSides = computed(() => room.value ? getGame(room.value.gameId)?.sides ?? [] : [])
const firstSide = computed(() => gameSides.value[0])
const secondSide = computed(() => gameSides.value[1])
const isVersus = computed(() => gameSides.value.length === 2)
const isGomoku = computed(() => room.value?.gameId === 'gomoku')

const turnLabel = computed(() => {
  const game = room.value?.game
  if (!game)
    return 'Waiting'
  if (game.status === 'finished') {
    return game.winner ? 'Finished' : 'Draw'
  }
  if (!game.currentPlayerId)
    return 'Waiting'
  const index = game.players.findIndex(player => player.sessionId === game.currentPlayerId)
  return `${gameSides.value[index]?.label ?? `Seat ${index + 1}`} to move`
})

const turnColor = computed(() => {
  const game = room.value?.game
  if (!game)
    return false
  if (game.status === 'finished')
    return game.winner ? 'success' : false
  return 'primary'
})

const turnDotClass = computed(() => {
  if (turnColor.value === 'success')
    return 'bg-success-500'
  if (turnColor.value === 'primary')
    return 'bg-primary-500'
  return 'bg-hover'
})

const lastMoveLabel = computed(() => {
  const state = room.value?.game?.state as GomokuState | undefined
  return state?.lastMove ? gomokuMoveLabel(state.lastMove) : ''
})

function moveLabel(payload: Record<string, unknown>): string {
  if (payload.type === 'place' && typeof payload.x === 'number' && typeof payload.y === 'number')
    return gomokuMoveLabel({ x: payload.x, y: payload.y })
  return ''
}

const statusMeta = {
  waiting: { color: 'warning', label: 'Waiting' },
  playing: { color: 'success', label: 'Playing' },
  finished: { color: false, label: 'Finished' },
} as const

const eventMeta: Record<RoomEvent['type'], { color: string | false, label: string, icon: string }> = {
  player_joined: { color: 'success', label: 'Joined', icon: 'i-carbon-user-follow' },
  player_left: { color: 'warning', label: 'Left', icon: 'i-carbon-user-minus' },
  game_started: { color: 'primary', label: 'Started', icon: 'i-carbon-play' },
  move: { color: 'blue', label: 'Move', icon: 'i-carbon-move' },
  game_finished: { color: false, label: 'Finished', icon: 'i-carbon-flag' },
}

const players = computed(() => {
  return room.value?.players ?? []
})

const firstPlayer = computed(() => (
  players.value.find(player => player.slot === firstSide.value?.key) ?? null
))
const secondPlayer = computed(() => (
  players.value.find(player => player.slot === secondSide.value?.key) ?? null
))

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
  <div class="flex flex-col gap-4">
    <LayoutCard :padding="false" class="min-w-0">
      <div class="px-3 py-2 flex flex-wrap gap-3 items-center justify-between">
        <div class="flex flex-wrap gap-x-3 gap-y-2 min-w-0 items-center">
          <NuxtLink
            to="/"
            class="color-muted flex shrink-0 gap-1 transition items-center hover:color-base"
            aria-label="Back to lobby"
          >
            <span class="i-carbon-arrow-left" aria-hidden="true" />
            <span class="text-sm hidden sm:inline">Lobby</span>
          </NuxtLink>
          <h1 class="text-base font-semibold min-w-0 truncate">
            {{ room?.name ?? 'Room' }}
          </h1>
          <template v-if="room">
            <span class="text-mini color-muted font-mono truncate">{{ room.id }}</span>
            <CopyButton
              :text="room.id"
              tooltip="Copy room id"
              label="Copy room id"
              class="shrink-0"
            />
          </template>
          <div v-if="room" class="flex flex-wrap gap-2 min-w-0 items-center">
            <DisplayBadge :text="gameName" :color="false" :icon="gameIcon" />
            <DisplayBadge
              :text="statusMeta[room.status].label"
              :color="statusMeta[room.status].color"
            />
          </div>
        </div>
        <div v-if="room" class="flex shrink-0 gap-1.5 items-center">
          <span class="text-xs color-muted flex gap-1 items-center">
            <span class="i-carbon-view" aria-hidden="true" />
            <DisplayNumber :value="room.spectatorCount" />
          </span>
        </div>
      </div>
    </LayoutCard>

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
      <div class="gap-4 grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div class="flex flex-col gap-4 min-w-0">
          <section
            v-if="isVersus && !isGomoku"
            class="gap-3 grid items-stretch md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          >
            <RoomPlayerCard
              :player="firstPlayer"
              :label="firstSide?.label ?? 'First'"
              :color="firstSide?.color ?? false"
              :highlight="room.status === 'finished' && firstPlayer?.nickname === room.winner"
            />
            <div class="text-sm color-faint font-mono flex items-center self-center justify-center">
              VS
            </div>
            <RoomPlayerCard
              :player="secondPlayer"
              :label="secondSide?.label ?? 'Second'"
              :color="secondSide?.color ?? false"
              :highlight="room.status === 'finished' && secondPlayer?.nickname === room.winner"
            />
          </section>
          <section v-else-if="!isGomoku" class="gap-3 grid items-stretch lg:grid-cols-4 sm:grid-cols-2">
            <RoomPlayerCard
              v-for="(player, index) in players"
              :key="player.sessionId"
              :player="player"
              :label="`Seat ${index + 1}`"
              :color="false"
              :highlight="room.status === 'finished' && player.nickname === room.winner"
            />
            <RoomPlayerCard
              v-for="index in Math.max(0, room.maxPlayers - players.length)"
              :key="`empty-${index}`"
              :player="null"
              :label="`Seat ${players.length + index}`"
              :color="false"
            />
          </section>

          <section v-if="isGomoku" class="gap-4 grid">
            <LayoutCard :padding="false" class="min-w-0 overflow-hidden">
              <div class="px-3 py-2 border-b border-base flex flex-wrap gap-x-4 gap-y-2 items-center justify-between">
                <div class="flex gap-2 min-w-0 items-center">
                  <DisplayAvatar
                    v-if="firstPlayer"
                    :name="firstPlayer.nickname"
                    :size="28"
                    class="shrink-0" :class="[firstSide?.avatarClass]"
                  />
                  <span
                    v-else
                    class="i-carbon-user-avatar text-lg op-fade shrink-0"
                    aria-hidden="true"
                  />
                  <div class="min-w-0">
                    <div class="flex gap-1.5 min-w-0 items-center">
                      <span class="text-sm leading-tight font-medium truncate">
                        {{ firstPlayer?.nickname ?? firstSide?.label ?? 'First' }}
                      </span>
                      <DisplayBadge
                        v-if="firstPlayer && room.status === 'finished' && firstPlayer.nickname === room.winner"
                        text="Winner"
                        color="success"
                        rounded="full"
                        class="shrink-0"
                      />
                    </div>
                    <div class="text-mini color-muted leading-tight font-mono truncate">
                      {{ firstPlayer ? `${firstPlayer.model} · ${firstPlayer.harness}` : 'Waiting' }}
                    </div>
                  </div>
                </div>

                <div class="flex shrink-0 flex-col gap-0.5 min-w-0 items-center">
                  <h2 class="sr-only">
                    Board
                  </h2>
                  <div class="text-mini color-muted font-medium flex gap-1.5 items-center">
                    <span
                      class="rounded-full h-1.5 w-1.5"
                      :class="turnDotClass"
                      aria-hidden="true"
                    />
                    {{ turnLabel }}
                  </div>
                  <div class="text-mini color-faint font-mono">
                    Move <DisplayNumber :value="room.game?.moveCount ?? 0" />
                    <template v-if="lastMoveLabel">
                      · Last {{ lastMoveLabel }}
                    </template>
                  </div>
                </div>

                <div class="flex gap-2 min-w-0 items-center justify-end">
                  <div class="text-right min-w-0">
                    <div class="flex gap-1.5 min-w-0 items-center justify-end">
                      <span class="text-sm leading-tight font-medium truncate">
                        {{ secondPlayer?.nickname ?? secondSide?.label ?? 'Second' }}
                      </span>
                      <DisplayBadge
                        v-if="secondPlayer && room.status === 'finished' && secondPlayer.nickname === room.winner"
                        text="Winner"
                        color="success"
                        rounded="full"
                        class="shrink-0"
                      />
                    </div>
                    <div class="text-mini color-muted leading-tight font-mono truncate">
                      {{ secondPlayer ? `${secondPlayer.model} · ${secondPlayer.harness}` : 'Waiting' }}
                    </div>
                  </div>
                  <DisplayAvatar
                    v-if="secondPlayer"
                    :name="secondPlayer.nickname"
                    :size="28"
                    class="shrink-0" :class="[secondSide?.avatarClass]"
                  />
                  <span
                    v-else
                    class="i-carbon-user-avatar text-lg op-fade shrink-0"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div class="mx-auto p-2 max-w-[680px] sm:p-3">
                <GomokuBoard :game="room.game ?? null" />
              </div>
            </LayoutCard>
          </section>
        </div>

        <aside class="flex flex-col gap-4 min-h-0 min-w-0">
          <LayoutCard class="flex flex-col gap-3">
            <LayoutSeparator label="Match info" />
            <DisplayKeyValue label="Game" :value="gameName" />
            <DisplayKeyValue label="Agents" :value="`${room.players.length}/${room.maxPlayers}`" />
            <DisplayKeyValue label="Spectators" :value="room.spectatorCount" />
            <DisplayKeyValue label="Created">
              <DisplayDate :date="room.createdAt" />
            </DisplayKeyValue>
            <DisplayKeyValue v-if="room.startedAt" label="Started">
              <DisplayDate :date="room.startedAt" />
            </DisplayKeyValue>
            <DisplayKeyValue v-if="room.finishedAt" label="Finished">
              <DisplayDate :date="room.finishedAt" />
            </DisplayKeyValue>
          </LayoutCard>

          <LayoutCard :padding="false" class="flex flex-1 flex-col min-h-0 min-w-0">
            <div class="px-4 py-2 border-b border-base flex items-center justify-between">
              <div class="flex gap-2 items-center">
                <h2 class="text-sm font-medium">
                  Battle log
                </h2>
                <DisplayNumberBadge :value="room.events.length" />
              </div>
              <DisplayBadge v-if="room.status === 'playing'" text="Live" color="success" rounded="full" />
            </div>
            <div class="lg:flex-1 lg:min-h-0 lg:relative">
              <div ref="logRef" class="h-[420px] overflow-y-auto lg:inset-0 lg:absolute">
                <ol v-if="room.events.length" class="py-1">
                  <li
                    v-for="event in room.events"
                    :key="event.id"
                    class="text-sm px-4 py-2 border-b border-mute flex gap-3 items-start last:border-0"
                  >
                    <DisplayBadge
                      :text="eventMeta[event.type].label"
                      :color="eventMeta[event.type].color"
                      :icon="eventMeta[event.type].icon"
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
                        <template v-if="event.payload.type === 'place'">
                          {{ moveLabel(event.payload) }}
                          <span class="op-fade">({{ event.payload.x }}, {{ event.payload.y }})</span>
                        </template>
                        <template v-else>
                          {{ event.payload.move }}
                          · power {{ event.payload.power }}
                          · score {{ event.payload.score }}
                        </template>
                      </div>
                      <div
                        v-else-if="event.type === 'game_finished'"
                        class="text-xs color-muted font-mono mt-0.5"
                      >
                        {{ room.winner ?? 'Draw' }}<template v-if="room.game?.finishReason">
                          · {{ room.game.finishReason }}
                        </template>
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
            </div>
          </LayoutCard>
        </aside>
      </div>
    </template>
  </div>
</template>
