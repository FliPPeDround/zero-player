<script setup lang="ts">
import type { Room, RoomEvent } from '#shared/rooms'
import { getGame } from '#shared/games'
import { gomokuMoveLabel } from '#shared/gomoku'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const props = defineProps<{
  room: Room | null
  winnerNickname?: string
}>()

const gameSides = computed(() => getGame(props.room?.gameId ?? '')?.sides ?? [])

function moveLabel(payload: Record<string, unknown>): string {
  if (payload.type === 'place' && typeof payload.x === 'number' && typeof payload.y === 'number')
    return gomokuMoveLabel({ x: payload.x, y: payload.y })
  if (payload.type === 'bid' && typeof payload.count === 'number' && typeof payload.face === 'number')
    return `${payload.count}×${payload.face}`
  if (payload.type === 'call')
    return 'Call'
  return ''
}

/** Nickname of the Liar's Dice player who lost a die on a call, by seat slot. */
function liarDiceLoserName(payload: Record<string, unknown>): string {
  const side = payload.loserSide
  if (typeof side !== 'string')
    return ''
  return props.room?.players.find(player => player.slot === side)?.nickname ?? ''
}

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
  for (const event of props.room?.events ?? []) {
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

/** Every event carries the mover's seat (`payload.side`), so the avatar tint is a direct lookup. */
function moveAvatarClass(event: RoomEvent): string {
  const side = event.payload?.side
  if (typeof side !== 'string')
    return ''
  return gameSides.value.find(sideDef => sideDef.key === side)?.avatarClass ?? ''
}

const winnerDotClass = computed(() => {
  const winner = props.room?.players.find(player => player.sessionId === props.room?.winner)
  return gameSides.value.find(side => side.key === winner?.slot)?.dotClass ?? ''
})

const logRef = ref<HTMLElement | null>(null)
watch(() => props.room?.events.length, () => {
  nextTick(() => {
    if (logRef.value)
      logRef.value.scrollTop = logRef.value.scrollHeight
  })
})
</script>

<template>
  <LayoutCard
    :padding="false"
    class="flex flex-1 flex-col min-h-[420px] min-w-0 overflow-hidden"
  >
    <div class="px-3 py-2 border-b border-base flex items-center">
      <div class="flex gap-2 items-center">
        <h2 class="text-sm font-medium">
          Battle log
        </h2>
        <DisplayNumberBadge :value="room?.events.length ?? 0" />
      </div>
    </div>
    <div class="lg:flex-1 lg:min-h-0 lg:relative">
      <div ref="logRef" class="scroll-fade-y h-[420px] overflow-y-auto lg:h-auto lg:inset-0 lg:absolute">
        <ol v-if="room?.events.length" class="py-1">
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
                  <template v-else-if="event.payload.type === 'bid'">
                    <span class="text-sm color-base font-medium font-mono shrink-0">
                      {{ moveLabel(event.payload) }}
                    </span>
                  </template>
                  <template v-else-if="event.payload.type === 'call'">
                    <span class="text-sm color-base font-medium font-mono shrink-0">
                      {{ moveLabel(event.payload) }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-sm color-base font-medium font-mono shrink-0">
                      {{ event.payload.expression ?? event.payload.move }}
                    </span>
                  </template>
                  <span class="flex-1" aria-hidden="true" />
                  <DisplayDate
                    :date="event.at"
                    :live="room?.status === 'playing'"
                    class="text-mini color-faint shrink-0"
                  />
                </div>
                <div
                  v-if="event.payload.type === 'answer'"
                  class="text-mini color-muted font-mono mt-0.5 tabular-nums"
                >
                  Q{{ event.payload.question ?? '?' }} ·
                  {{ event.payload.correct ? 'Correct' : 'Wrong' }}
                  <template v-if="typeof event.payload.feedback === 'string' && event.payload.feedback">
                    · {{ event.payload.feedback }}
                  </template>
                </div>
                <div
                  v-if="event.payload.type === 'call' && typeof event.payload.total === 'number'"
                  class="text-mini color-muted font-mono mt-0.5 tabular-nums"
                >
                  {{ event.payload.correct ? 'Held' : 'Bluff' }} · total {{ event.payload.total }}
                  <template v-if="liarDiceLoserName(event.payload)">
                    · {{ liarDiceLoserName(event.payload) }} loses a die
                  </template>
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
                  <span class="color-base font-medium">{{ winnerNickname ? `${winnerNickname} won` : 'Draw' }}</span>
                  <span v-if="room?.game?.finishReason" class="text-mini color-faint font-mono"> · {{ room.game.finishReason }}</span>
                </template>
                <template v-else>
                  {{ eventMeta[event.type].label }}
                </template>
              </p>
              <DisplayDate
                :date="event.at"
                :live="room?.status === 'playing'"
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
                :live="room?.status === 'playing'"
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
</template>
