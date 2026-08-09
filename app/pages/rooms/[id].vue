<script setup lang="ts">
import type { GomokuState } from '#shared/gomoku'
import type { RoomEvent } from '#shared/rooms'
import { getGame, getGameName } from '#shared/games'
import { gomokuMoveLabel } from '#shared/gomoku'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
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
const { room, pending, error, closed, open, close } = await useRoomDetailFeed(roomId)

onMounted(open)
onUnmounted(close)

const gameName = computed(() => room.value ? getGameName(room.value.gameId) : '')
const gameDescription = computed(() => room.value ? getGame(room.value.gameId)?.description ?? '' : '')
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
  if (game.status === 'aborted')
    return 'Aborted'
  if (game.status === 'finished')
    return game.winner ? 'Finished' : 'Draw'
  if (!game.currentPlayerId)
    return 'Waiting'
  const index = game.players.findIndex(player => player.sessionId === game.currentPlayerId)
  return `${gameSides.value[index]?.label ?? `Seat ${index + 1}`} to move`
})

const turnColor = computed(() => {
  const game = room.value?.game
  if (!game)
    return false
  if (game.status === 'aborted')
    return 'error'
  if (game.status === 'finished')
    return game.winner ? 'success' : false
  return 'primary'
})

const turnDotClass = computed(() => {
  if (turnColor.value === 'success')
    return 'bg-success-500'
  if (turnColor.value === 'error')
    return 'bg-error-500'
  if (turnColor.value === 'primary')
    return 'bg-primary-500'
  return 'bg-hover'
})

const closesInLabel = computed(() => {
  const at = room.value?.closesAt
  if (!at)
    return null
  const minutes = Math.max(1, Math.ceil((new Date(at).getTime() - Date.now()) / 60_000))
  return `In ~${minutes}m`
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
  aborted: { color: 'error', label: 'Aborted' },
} as const

const eventMeta: Record<RoomEvent['type'], { label: string, icon: string }> = {
  player_joined: { label: 'Joined', icon: 'i-carbon-user-follow' },
  player_left: { label: 'Left', icon: 'i-carbon-user-minus' },
  game_started: { label: 'Game started', icon: 'i-carbon-play' },
  move: { label: 'Move', icon: 'i-carbon-move' },
  game_finished: { label: 'Game finished', icon: 'i-carbon-flag' },
  game_aborted: { label: 'Game aborted', icon: 'i-carbon-stop-outline' },
  room_closed: { label: 'Room closed', icon: 'i-carbon-close-outline' },
}

/**
 * Lifecycle events render as full-width marker bands that split the feed into
 * phases (lobby chatter, moves, result). Everything else is quiet chatter.
 */
const markerTypes = new Set<RoomEvent['type']>(['game_started', 'game_finished', 'game_aborted'])

/** Score-sheet numbering: `#1`, `#2`, ... counting only move events. */
const moveNumbers = computed(() => {
  const numbers = new Map<string, number>()
  let count = 0
  for (const event of room.value?.events ?? []) {
    if (event.type === 'move')
      numbers.set(event.id, (count += 1))
  }
  return numbers
})

function chatterVerb(event: RoomEvent): string {
  if (event.type === 'player_joined')
    return 'joined'
  if (event.type === 'player_left')
    return 'left'
  return eventMeta[event.type].label
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

/** Every event carries the mover's seat (`payload.side`), so the avatar tint is a direct lookup. */
function moveAvatarClass(event: RoomEvent): string {
  const side = event.payload?.side
  if (typeof side !== 'string')
    return ''
  return gameSides.value.find(sideDef => sideDef.key === side)?.avatarClass ?? ''
}

const winnerDotClass = computed(() => {
  const winner = players.value.find(player => player.nickname === room.value?.winner)
  return gameSides.value.find(side => side.key === winner?.slot)?.dotClass ?? ''
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
  <div class="flex flex-col gap-4">
    <LayoutCard :padding="false" class="min-w-0">
      <div class="px-4 py-3 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between">
        <div class="flex flex-col gap-1 min-w-0">
          <div class="flex flex-wrap gap-x-3 gap-y-1 min-w-0 items-center">
            <ActionIconButton
              as="RouterLink"
              to="/"
              icon="i-carbon-arrow-left"
              tooltip="Back to lobby"
              label="Back to lobby"
              class="text-base shrink-0"
            />
            <h1 class="text-base font-semibold min-w-0 truncate">
              {{ room?.name ?? 'Room' }}
            </h1>
          </div>
          <div v-if="room" class="text-mini color-muted font-mono flex gap-1.5 min-w-0 items-center">
            <span class="truncate">{{ room.id }}</span>
            <CopyButton
              :text="room.id"
              tooltip="Copy room id"
              label="Copy room id"
              class="shrink-0"
            />
          </div>
        </div>
        <div v-if="room" class="flex shrink-0 flex-col gap-1 items-end">
          <DisplayBadge :text="gameName" :color="false" :icon="gameIcon" />
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

    <FeedbackEmptyState
      v-else-if="closed"
      icon="i-carbon-close-outline"
      title="Room closed"
    >
      <template #hint>
        {{ room?.name }} has been closed and removed from the lobby.
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
            <p class="text-mini color-muted -mt-1.5">
              {{ gameDescription }}
            </p>
            <DisplayKeyValue label="Status">
              <DisplayBadge
                :text="statusMeta[room.status].label"
                :color="statusMeta[room.status].color"
              />
            </DisplayKeyValue>
            <DisplayKeyValue label="Moves">
              <span class="flex gap-1.5 items-baseline">
                <DisplayNumber :value="room.game?.moveCount ?? 0" />
                <span v-if="lastMoveLabel" class="text-mini color-faint font-mono">
                  {{ lastMoveLabel }}
                </span>
              </span>
            </DisplayKeyValue>
            <DisplayKeyValue label="Last activity">
              <DisplayDate :date="room.updatedAt" :live="room.status === 'playing'" />
            </DisplayKeyValue>
            <DisplayKeyValue v-if="room.status === 'finished' && room.winner" label="Winner" :value="room.winner" />
            <DisplayKeyValue
              v-if="closesInLabel"
              label="Auto-closes"
            >
              <span class="text-mini color-muted">{{ closesInLabel }}</span>
            </DisplayKeyValue>
          </LayoutCard>

          <LayoutCard :padding="false" class="flex flex-1 flex-col min-h-0 min-w-0">
            <div class="px-3 py-2 border-b border-base flex items-center">
              <div class="flex gap-2 items-center">
                <h2 class="text-sm font-medium">
                  Battle log
                </h2>
                <DisplayNumberBadge :value="room.events.length" />
              </div>
            </div>
            <div class="lg:flex-1 lg:min-h-0 lg:relative">
              <div ref="logRef" class="scroll-fade-y h-[420px] overflow-y-auto lg:inset-0 lg:absolute">
                <ol v-if="room.events.length" class="py-1">
                  <li
                    v-for="event in room.events"
                    :key="event.id"
                    class="first:border-t-0"
                    :class="{ 'border-t border-mute': markerTypes.has(event.type) }"
                  >
                    <!-- Move: identity and move share one header line; the reason sits below -->
                    <div
                      v-if="event.type === 'move' && event.payload"
                      class="px-3 py-2 flex gap-2.5"
                    >
                      <DisplayAvatar
                        :name="event.actor ?? eventMeta.move.label"
                        :size="22"
                        class="mt-0.5 shrink-0"
                        :class="[moveAvatarClass(event)]"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="flex gap-x-1.5 min-w-0 items-center">
                          <span class="text-compact color-base font-medium min-w-0 truncate">
                            {{ event.actor ?? eventMeta.move.label }}
                          </span>
                          <span class="text-mini color-faint shrink-0" aria-hidden="true">·</span>
                          <DisplayNumberBadge
                            :value="moveNumbers.get(event.id) ?? 0"
                            prefix="#"
                            class="shrink-0"
                          />
                          <template v-if="event.payload.type === 'place'">
                            <span class="text-sm color-base font-medium font-mono shrink-0">
                              {{ moveLabel(event.payload) }}
                            </span>
                          </template>
                          <template v-else>
                            <span class="text-sm color-base font-medium font-mono shrink-0">
                              {{ event.payload.move }}
                            </span>
                          </template>
                          <span class="flex-1" aria-hidden="true" />
                          <DisplayDate
                            :date="event.at"
                            :live="room.status === 'playing'"
                            class="text-mini color-faint shrink-0"
                          />
                        </div>
                        <div
                          v-if="event.payload.type !== 'place'"
                          class="text-mini color-faint font-mono mt-0.5 tabular-nums"
                        >
                          power {{ event.payload.power }} · score {{ event.payload.score }}
                        </div>
                        <p
                          v-if="typeof event.payload.reason === 'string' && event.payload.reason"
                          class="text-compact color-muted mt-1 pl-2 border-l border-mute whitespace-pre-wrap break-words"
                        >
                          {{ event.payload.reason }}
                        </p>
                      </div>
                    </div>
                    <!-- Lifecycle markers: quiet bands that split the feed into phases -->
                    <div
                      v-else-if="markerTypes.has(event.type)"
                      class="text-compact px-3 py-1.5 bg-secondary flex gap-2.5 items-center"
                    >
                      <span class="color-muted flex shrink-0 w-[22px] justify-center" aria-hidden="true">
                        <span :class="eventMeta[event.type].icon" />
                      </span>
                      <p class="color-muted flex-1 min-w-0 truncate">
                        <template v-if="event.type === 'game_finished'">
                          <span
                            v-if="winnerDotClass"
                            class="mr-1 rounded-full h-2 w-2 inline-block"
                            :class="winnerDotClass"
                            aria-hidden="true"
                          />
                          <span class="color-base font-medium">{{ room.winner ? `${room.winner} won` : 'Draw' }}</span>
                          <span v-if="room.game?.finishReason" class="text-mini color-faint font-mono"> · {{ room.game.finishReason }}</span>
                        </template>
                        <template v-else>
                          {{ eventMeta[event.type].label }}
                        </template>
                      </p>
                      <DisplayDate
                        :date="event.at"
                        :live="room.status === 'playing'"
                        class="text-mini color-faint shrink-0"
                      />
                    </div>
                    <!-- Chatter: joins/leaves recede to faint one-liners -->
                    <div
                      v-else
                      class="text-mini px-3 py-1 flex gap-2.5 items-center"
                    >
                      <span class="op-fade flex shrink-0 w-[22px] justify-center" aria-hidden="true">
                        <span :class="eventMeta[event.type].icon" />
                      </span>
                      <p class="color-muted flex-1 min-w-0 truncate">
                        <span v-if="event.actor" class="color-base font-medium">{{ event.actor }}</span> {{ chatterVerb(event) }}
                      </p>
                      <DisplayDate
                        :date="event.at"
                        :live="room.status === 'playing'"
                        class="color-faint shrink-0"
                      />
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
