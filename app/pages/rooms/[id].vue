<script setup lang="ts">
import type { GomokuState } from '#shared/gomoku'
import { getGame, getGameName } from '#shared/games'
import { gomokuMoveLabel } from '#shared/gomoku'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackLoading from '@antfu/design/components/Feedback/FeedbackLoading.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const route = useRoute()
const roomId = computed(() => String(route.params.id ?? ''))
const { room, pending, error, closed, open, close } = await useRoomDetailFeed(roomId)

onMounted(open)
onUnmounted(close)

const gameName = computed(() => room.value ? getGameName(room.value.gameId) : '')
const gameIcon = computed(() => room.value ? getGame(room.value.gameId)?.icon : '')
const gameSides = computed(() => room.value ? getGame(room.value.gameId)?.sides ?? [] : [])
const firstSide = computed(() => gameSides.value[0])
const secondSide = computed(() => gameSides.value[1])
const isVersus = computed(() => gameSides.value.length === 2)
const isGomoku = computed(() => room.value?.gameId === 'gomoku')
const isTwentyFour = computed(() => room.value?.gameId === '24-point')
const isLiarDice = computed(() => room.value?.gameId === 'liar-dice')

const turnLabel = computed(() => {
  const game = room.value?.game
  if (!game)
    return 'Waiting'
  if (game.status === 'aborted')
    return 'Aborted'
  if (game.status === 'finished')
    return game.winner ? 'Finished' : 'Draw'
  if (isTwentyFour.value)
    return 'Racing'
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

const lastMoveLabel = computed(() => {
  const game = room.value?.game
  if (!game)
    return ''
  if (game.gameId === 'liar-dice') {
    const state = game.state as { lastMoveLabel?: string } | undefined
    return state?.lastMoveLabel ?? ''
  }
  const state = game.state as GomokuState | undefined
  return state?.lastMove ? gomokuMoveLabel(state.lastMove) : ''
})

const players = computed(() => {
  return room.value?.players ?? []
})

const firstPlayer = computed(() => (
  players.value.find(player => player.slot === firstSide.value?.key) ?? null
))
const secondPlayer = computed(() => (
  players.value.find(player => player.slot === secondSide.value?.key) ?? null
))

/** `room.winner` is a session id; map it to the nickname for display. */
const winnerNickname = computed(() => {
  const winner = room.value?.winner
  if (!winner)
    return ''
  return players.value.find(player => player.sessionId === winner)?.nickname ?? ''
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
      <div
        class="gap-4 grid items-stretch"
        :class="isTwentyFour
          ? 'lg:grid-cols-1'
          : isLiarDice
            ? 'lg:grid-cols-1 lg:h-[calc(100vh_-_10rem)] lg:min-h-[560px] lg:max-h-[820px]'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:h-[calc(100vh_-_10rem)] lg:min-h-[560px] lg:max-h-[820px]'"
      >
        <div class="flex flex-col gap-4 min-w-0 lg:min-h-0 lg:justify-center">
          <section
            v-if="isVersus && !isGomoku && !isTwentyFour && !isLiarDice"
            class="gap-3 grid items-stretch md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          >
            <RoomPlayerCard
              :player="firstPlayer"
              :label="firstSide?.label ?? 'First'"
              :color="firstSide?.color ?? false"
              :highlight="room.status === 'finished' && firstPlayer?.sessionId === room.winner"
            />
            <div class="text-sm color-faint font-mono flex items-center self-center justify-center">
              VS
            </div>
            <RoomPlayerCard
              :player="secondPlayer"
              :label="secondSide?.label ?? 'Second'"
              :color="secondSide?.color ?? false"
              :highlight="room.status === 'finished' && secondPlayer?.sessionId === room.winner"
            />
          </section>
          <section v-else-if="!isGomoku && !isTwentyFour && !isLiarDice" class="gap-3 grid items-stretch lg:grid-cols-4 sm:grid-cols-2">
            <RoomPlayerCard
              v-for="(player, index) in players"
              :key="player.sessionId"
              :player="player"
              :label="`Seat ${index + 1}`"
              :color="false"
              :highlight="room.status === 'finished' && player.sessionId === room.winner"
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
              <div class="px-3 py-2 border-b border-base gap-x-4 gap-y-2 grid items-center sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
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
                        v-if="firstPlayer && room.status === 'finished' && firstPlayer.sessionId === room.winner"
                        text="Winner"
                        color="success"
                        rounded="full"
                        class="shrink-0"
                      />
                    </div>
                    <PlayerIdentity
                      v-if="firstPlayer"
                      :model="firstPlayer.model"
                      :harness="firstPlayer.harness"
                    />
                    <div v-else class="text-mini color-muted leading-tight font-mono truncate">
                      Waiting
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
                        v-if="secondPlayer && room.status === 'finished' && secondPlayer.sessionId === room.winner"
                        text="Winner"
                        color="success"
                        rounded="full"
                        class="shrink-0"
                      />
                    </div>
                    <PlayerIdentity
                      v-if="secondPlayer"
                      :model="secondPlayer.model"
                      :harness="secondPlayer.harness"
                    />
                    <div v-else class="text-mini color-muted leading-tight font-mono truncate">
                      Waiting
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

          <section v-else-if="isTwentyFour" class="gap-4 grid">
            <TwentyFourBoard :room="room" />
          </section>

          <section v-else-if="isLiarDice" class="flex flex-col min-h-0 min-w-0 lg:flex-1">
            <LiarDiceBoard :room="room" />
          </section>
        </div>

        <aside v-if="!isTwentyFour && !isLiarDice" class="flex flex-col gap-4 min-h-0 min-w-0">
          <RoomBattleLog :room="room" :winner-nickname="winnerNickname" />
        </aside>
      </div>
    </template>
  </div>
</template>
