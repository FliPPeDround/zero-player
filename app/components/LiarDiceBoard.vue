<script setup lang="ts">
import type { GameSide } from '#shared/games'
import type { LiarDiceState } from '#shared/liar-dice'
import type { Room, RoomPlayer } from '#shared/rooms'
import { getGame } from '#shared/games'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const props = defineProps<{
  room: Room | null
}>()

const { t } = useAppI18n()

/** Pip positions on a 3x3 grid (row-major 0-8) for each die face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const state = computed<LiarDiceState | null>(() => {
  const value = props.room?.game?.state
  if (!value || typeof value !== 'object')
    return null
  return value as LiarDiceState
})

const sides = computed<GameSide[]>(() => getGame(props.room?.gameId ?? '')?.sides ?? [])

interface RoundActionView {
  kind: 'bid' | 'call'
  player: RoomPlayer | null
  count: number
  face: number
  reason?: string
  outcome?: {
    correct: boolean
    total: number
    loser: RoomPlayer | null
  }
}

interface RoundCallView {
  caller: RoomPlayer | null
  bidder: RoomPlayer | null
  loser: RoomPlayer | null
  count: number
  face: number
  total: number
  correct: boolean
  reason?: string
  at: string
}

interface RoundView {
  roundNumber: number
  opener: RoomPlayer | null
  rolls: Record<string, number[]>
  actions: RoundActionView[]
  call: RoundCallView | null
  isCurrent: boolean
}

interface HandView {
  side: GameSide
  player: RoomPlayer | null
  sessionId: string
  dice: number[]
  diceCount: number
  isWinner: boolean
}

/** Liar's Dice moves in play order, used to attach reasons/timestamps to round actions. */
const moveEvents = computed(() => (
  (props.room?.events ?? []).filter(event => (
    event.type === 'move'
    && event.payload
    && (event.payload.type === 'bid' || event.payload.type === 'call')
  ))
))

/**
 * Reconstruct the match as round-by-round replay. Each round carries both
 * hands, every bid in order and the call that closed it, so spectators can
 * follow one round at a time instead of a flat timeline.
 */
const rounds = computed<RoundView[]>(() => {
  const gameState = state.value
  const room = props.room
  if (!gameState || !room)
    return []

  const events = moveEvents.value
  const sources = Array.isArray(gameState.rounds) && gameState.rounds.length
    ? gameState.rounds
    : gameState.round
      ? [{ ...gameState.round, roundNumber: gameState.roundNumber }]
      : []

  let eventIndex = 0
  return sources.map((round) => {
    const bidViews = round.bids.map((bid) => {
      const event = events[eventIndex++]
      const player = room.players.find(item => item.sessionId === bid.playerId) ?? null
      return {
        kind: 'bid' as const,
        player,
        count: bid.count,
        face: bid.face,
        reason: typeof event?.payload?.reason === 'string' ? event.payload.reason : undefined,
      }
    })

    const call = round.call
    const callEvent = call ? events[eventIndex++] : undefined
    const callView: RoundActionView | null = call
      ? {
          kind: 'call',
          player: room.players.find(item => item.sessionId === call.callerId) ?? null,
          count: call.count,
          face: call.face,
          reason: typeof callEvent?.payload?.reason === 'string' ? callEvent.payload.reason : undefined,
          outcome: {
            correct: call.correct,
            total: call.total,
            loser: room.players.find(item => item.sessionId === call.loserId) ?? null,
          },
        }
      : null
    return {
      roundNumber: round.roundNumber,
      opener: room.players.find(item => item.sessionId === round.opener) ?? null,
      rolls: round.rolls,
      actions: [...bidViews, ...(callView ? [callView] : [])],
      call: call
        ? {
            caller: room.players.find(item => item.sessionId === call.callerId) ?? null,
            bidder: room.players.find(item => item.sessionId === call.bidderId) ?? null,
            loser: room.players.find(item => item.sessionId === call.loserId) ?? null,
            count: call.count,
            face: call.face,
            total: call.total,
            correct: call.correct,
            reason: typeof callEvent?.payload?.reason === 'string' ? callEvent.payload.reason : undefined,
            at: callEvent?.at ?? room.updatedAt,
          }
        : null,
      isCurrent: round.roundNumber === gameState.roundNumber,
    }
  })
})

/** Waiting rooms have no rounds yet; show the two seats as an empty round. */
const displayRounds = computed<RoundView[]>(() => {
  if (rounds.value.length)
    return rounds.value
  return props.room
    ? [{
        roundNumber: 1,
        opener: null,
        rolls: {},
        actions: [],
        call: null,
        isCurrent: false,
      }]
    : []
})

function roundHand(round: RoundView, side: GameSide): HandView {
  const player = props.room?.players.find(item => item.slot === side.key) ?? null
  const sessionId = player?.sessionId ?? ''
  const dice = round.rolls[sessionId] ?? []
  return {
    side,
    player,
    sessionId,
    dice,
    diceCount: dice.length,
    isWinner: !!player && round.isCurrent && props.room?.status === 'finished' && props.room.winner === sessionId,
  }
}

function roundHands(round: RoundView): HandView[] {
  return sides.value.map(side => roundHand(round, side))
}

function playerSide(player: RoomPlayer | null): GameSide | null {
  return sides.value.find(side => side.key === player?.slot) ?? null
}

function playerAvatarClass(player: RoomPlayer | null): string {
  return playerSide(player)?.avatarClass ?? ''
}

/** The side that won the call: whoever did not lose the die. */
function roundWinnerSide(round: RoundView): GameSide | null {
  const call = round.call
  if (!call)
    return null
  const winnerId = call.loser?.sessionId === call.caller?.sessionId
    ? call.bidder?.sessionId
    : call.caller?.sessionId
  const player = props.room?.players.find(item => item.sessionId === winnerId) ?? null
  return playerSide(player)
}

function roundWinnerDotClass(round: RoundView): string {
  const side = roundWinnerSide(round)
  if (side?.key === 'one')
    return 'bg-[#7c9fc4] ring-1 ring-[#7c9fc4]/40'
  if (side?.key === 'two')
    return 'bg-[#c08686] ring-1 ring-[#c08686]/40'
  return ''
}

const roundNumber = computed(() => state.value?.roundNumber ?? 1)

const currentBid = computed(() => {
  const bid = state.value?.currentBid
  if (!bid || !props.room)
    return null
  const bidder = props.room.players.find(player => player.sessionId === bid.playerId) ?? null
  return { count: bid.count, face: bid.face, bidder }
})

const turnPlayer = computed(() => {
  const currentId = props.room?.game?.currentPlayerId
  if (!currentId || !props.room)
    return null
  return props.room.players.find(player => player.sessionId === currentId) ?? null
})

const bidLabel = computed(() => {
  if (props.room?.status === 'finished')
    return t('ld.finalBid')
  if (props.room?.status === 'aborted')
    return t('ld.matchOver')
  return t('ld.currentBid')
})

const roundsRef = ref<HTMLElement | null>(null)
watch(() => displayRounds.value.length, () => {
  nextTick(() => {
    if (roundsRef.value)
      roundsRef.value.scrollTop = roundsRef.value.scrollHeight
  })
})

function hasPip(face: number, cell: number): boolean {
  return (PIPS[face] ?? []).includes(cell)
}

function dieTitle(nickname: string, index: number): string {
  return nickname ? t('ld.dieTitle', { name: nickname, count: index + 1 }) : ''
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-3 min-h-0 min-w-0">
    <div class="flex flex-wrap gap-x-3 gap-y-2 items-center justify-between">
      <div class="flex gap-2 min-w-0 items-center">
        <DisplayBadge
          icon="i-carbon-shuffle"
          :text="t('ld.bluff')"
          color="primary"
          rounded="full"
          class="shrink-0"
        />
        <span class="text-mini color-muted truncate">
          {{ t('ld.hint') }}
        </span>
      </div>
      <span class="text-mini color-muted flex shrink-0 gap-1.5 items-center">
        <span class="i-carbon-calendar" aria-hidden="true" />
        <DisplayNumberBadge
          :value="roundNumber"
          :prefix="t('ld.roundPrefix')"
          :suffix="t('ld.roundSuffix')"
          class="shrink-0"
        />
      </span>
    </div>

    <LayoutCard :padding="false" class="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
      <div class="px-4 py-3 border-b border-base flex flex-wrap gap-x-3 gap-y-1 items-center justify-between">
        <div class="flex gap-2 min-w-0 items-baseline">
          <span class="text-mini color-muted tracking-wide font-medium uppercase">
            {{ bidLabel }}
          </span>
          <span
            v-if="currentBid"
            class="text-2xl leading-none font-mono font-semibold tabular-nums"
          >
            {{ currentBid.count }}×{{ currentBid.face }}
          </span>
          <span v-else class="text-sm color-faint font-mono">
            {{ t('ld.openingBid') }}
          </span>
        </div>
        <span
          v-if="turnPlayer"
          class="text-mini color-muted flex shrink-0 gap-1.5 items-center"
        >
          <span class="rounded-full bg-primary-500 h-1.5 w-1.5" aria-hidden="true" />
          {{ currentBid
            ? t('ld.toRaiseOrCall', { name: turnPlayer.nickname })
            : t('ld.opensBidding', { name: turnPlayer.nickname }) }}
        </span>
      </div>

      <div ref="roundsRef" class="scroll-fade-y flex-1 min-h-0 overflow-y-auto">
        <div v-if="displayRounds.length" class="flex flex-col">
          <article
            v-for="round in displayRounds"
            :key="round.roundNumber"
            class="border-b border-mute last:border-b-0"
          >
            <div class="px-4 py-2 bg-secondary flex flex-wrap gap-x-3 gap-y-1 items-center justify-between">
              <div class="flex gap-2 min-w-0 items-center">
                <DisplayNumberBadge
                  v-if="room?.game"
                  :value="round.roundNumber"
                  :prefix="t('ld.roundPrefix')"
                  :suffix="t('ld.roundSuffix')"
                  class="shrink-0"
                />
                <template v-if="room?.game">
                  <span class="text-mini color-muted truncate">
                    {{ t('ld.opens', { name: round.opener?.nickname ?? t('ld.someone') }) }}
                  </span>
                </template>
                <span v-else class="text-mini color-muted truncate">
                  {{ t('ld.waitingForAgents') }}
                </span>
              </div>
              <div v-if="round.call" class="flex shrink-0 gap-2 items-center">
                <DisplayBadge
                  :text="round.call.correct ? t('log.held') : t('log.bluff')"
                  :color="round.call.correct ? 'warning' : 'success'"
                  rounded="full"
                  class="text-mini"
                />
                <AppDate
                  :date="round.call.at"
                  :live="room?.status === 'playing' && round.isCurrent"
                  class="text-mini color-faint"
                />
              </div>
            </div>

            <div class="p-4 gap-3 grid lg:auto-rows-fr lg:grid-cols-2">
              <div
                v-for="hand in roundHands(round)"
                :key="hand.side.key"
                class="bg-dots-20 p-4 border border-base rounded-xl bg-base flex flex-col gap-3 min-w-0"
              >
                <div
                  class="flex gap-2 min-w-0 items-center justify-between"
                  :class="hand.side.key === sides[0]?.key ? '' : 'flex-row-reverse'"
                >
                  <div
                    class="flex gap-2 min-w-0 items-center"
                    :class="hand.side.key === sides[0]?.key ? '' : 'flex-row-reverse'"
                  >
                    <DisplayAvatar
                      v-if="hand.player"
                      :name="hand.player.nickname"
                      :size="28"
                      class="shrink-0"
                      :class="[hand.side.avatarClass]"
                    />
                    <span
                      v-else
                      class="i-carbon-user-avatar text-lg op-fade shrink-0"
                      aria-hidden="true"
                    />
                    <div
                      class="min-w-0"
                      :class="hand.side.key === sides[0]?.key ? '' : 'text-right'"
                    >
                      <div
                        class="flex gap-1.5 min-w-0 items-center"
                        :class="hand.side.key === sides[0]?.key ? '' : 'justify-end'"
                      >
                        <span class="text-sm leading-tight font-medium truncate">
                          {{ hand.player?.nickname ?? hand.side.label }}
                        </span>
                        <DisplayBadge
                          v-if="hand.isWinner"
                          :text="t('common.winner')"
                          color="success"
                          rounded="full"
                          class="shrink-0"
                        />
                      </div>
                      <PlayerIdentity
                        v-if="hand.player"
                        :model="hand.player.model"
                        :harness="hand.player.harness"
                      />
                      <div v-else class="text-mini color-muted leading-tight font-mono truncate">
                        {{ t('status.waiting') }}
                      </div>
                    </div>
                  </div>
                  <div v-if="hand.player" class="flex shrink-0 gap-1.5 items-center">
                    <template v-if="hand.side.key === sides[0]?.key">
                      <span class="text-mini color-faint font-mono whitespace-nowrap">
                        {{ t('ld.dice') }}
                      </span>
                      <DisplayNumberBadge
                        :value="hand.diceCount"
                        color="primary"
                        class="shrink-0"
                      />
                    </template>
                    <template v-else>
                      <DisplayNumberBadge
                        :value="hand.diceCount"
                        color="primary"
                        class="shrink-0"
                      />
                      <span class="text-mini color-faint font-mono whitespace-nowrap">
                        {{ t('ld.dice') }}
                      </span>
                    </template>
                  </div>
                </div>

                <div
                  v-if="hand.player && hand.dice.length"
                  class="flex flex-1 flex-wrap gap-2 items-center justify-center"
                  :aria-label="t('ld.diceAria')"
                >
                  <div
                    v-for="(die, index) in hand.dice"
                    :key="index"
                    class="p-1.5 rounded-lg shrink-0 grid grid-cols-3 grid-rows-3 h-10 w-10"
                    :class="die === 1
                      ? 'bg-active border border-active ring-1 ring-primary-500/40 color-active'
                      : 'bg-base border border-base color-base'"
                    :title="die === 1
                      ? t('ld.wildTitle')
                      : dieTitle(hand.player?.nickname ?? '', index)"
                  >
                    <span
                      v-if="die === 1"
                      class="flex col-start-2 row-start-2 items-center justify-center"
                    >
                      <span class="i-carbon-star text-base" aria-hidden="true" />
                    </span>
                    <template v-else>
                      <span
                        v-for="cell in 9"
                        :key="cell"
                        class="flex items-center justify-center"
                      >
                        <span
                          v-if="hasPip(die, cell - 1)"
                          class="rounded-full bg-current h-2 w-2"
                          aria-hidden="true"
                        />
                      </span>
                    </template>
                  </div>
                </div>
                <div
                  v-else-if="!hand.player"
                  class="text-compact color-faint font-mono flex-1 grid place-items-center"
                >
                  {{ t('common.waitingForAgent') }}
                </div>
                <div
                  v-else
                  class="text-compact color-faint font-mono flex-1 grid place-items-center"
                >
                  {{ t('ld.diceInCup') }}
                </div>
              </div>
            </div>

            <div
              v-if="round.actions.length || (round.isCurrent && turnPlayer && room?.status === 'playing')"
              class="px-4 pb-4 flex flex-col gap-3 -mt-2"
            >
              <h3
                v-if="round.actions.length"
                class="text-mini color-muted tracking-wide font-medium uppercase"
              >
                {{ t('ld.actions') }}
              </h3>
              <div
                v-for="(action, actionIndex) in round.actions"
                :key="actionIndex"
                class="gap-2 grid grid-cols-[28px_minmax(0,1fr)_28px] items-start"
              >
                <div class="flex justify-start">
                  <DisplayAvatar
                    v-if="action.player?.slot === sides[0]?.key"
                    :name="action.player?.nickname ?? t('ld.agent')"
                    :size="24"
                    class="shrink-0"
                    :class="[playerAvatarClass(action.player)]"
                  />
                </div>
                <div class="min-w-0">
                  <div
                    class="text-mini color-base font-medium mb-1 truncate"
                    :class="action.player?.slot === sides[0]?.key ? 'text-left' : 'text-right'"
                  >
                    {{ action.player?.nickname ?? t('ld.agent') }}
                  </div>
                  <div
                    class="px-3 py-2 border border-base rounded-xl bg-secondary flex flex-col gap-1"
                    :class="[
                      action.player?.slot === sides[0]?.key
                        ? 'max-w-[75%]'
                        : 'ml-auto max-w-[75%] items-end text-right',
                    ]"
                  >
                    <div
                      class="flex flex-wrap gap-x-2 gap-y-0.5 items-center"
                      :class="action.player?.slot === sides[0]?.key ? '' : 'justify-end'"
                    >
                      <DisplayBadge
                        :text="action.kind === 'bid' ? t('ld.bid') : t('log.call')"
                        :color="action.kind === 'bid' ? 'primary' : 'warning'"
                        rounded="full"
                        class="text-mini shrink-0"
                      />
                      <span class="font-mono font-semibold tabular-nums">
                        {{ action.count }}×{{ action.face }}
                      </span>
                    </div>
                    <p v-if="action.reason" class="text-mini color-muted break-words">
                      {{ action.reason }}
                    </p>
                  </div>
                </div>
                <div class="flex justify-end">
                  <DisplayAvatar
                    v-if="action.player?.slot !== sides[0]?.key"
                    :name="action.player?.nickname ?? t('ld.agent')"
                    :size="24"
                    class="shrink-0"
                    :class="[playerAvatarClass(action.player)]"
                  />
                </div>
              </div>

              <div
                v-if="round.isCurrent && turnPlayer && room?.status === 'playing'"
                class="gap-2 grid grid-cols-[28px_minmax(0,1fr)_28px] items-start"
              >
                <div class="flex justify-start">
                  <DisplayAvatar
                    v-if="turnPlayer.slot === sides[0]?.key"
                    :name="turnPlayer.nickname"
                    :size="24"
                    class="shrink-0"
                    :class="[playerAvatarClass(turnPlayer)]"
                  />
                </div>
                <div class="min-w-0">
                  <div
                    class="text-mini color-base font-medium mb-1 truncate"
                    :class="turnPlayer.slot === sides[0]?.key ? 'text-left' : 'text-right'"
                  >
                    {{ turnPlayer.nickname }}
                  </div>
                  <div
                    class="px-3 py-2 border border-base rounded-xl flex gap-2 max-w-[75%] items-center"
                    :class="turnPlayer.slot === sides[0]?.key ? '' : 'ml-auto justify-end items-center text-right'"
                  >
                    <FeedbackSpinner class="shrink-0" />
                    <span class="text-mini color-muted">{{ t('ld.thinking') }}</span>
                  </div>
                </div>
                <div class="flex justify-end">
                  <DisplayAvatar
                    v-if="turnPlayer.slot !== sides[0]?.key"
                    :name="turnPlayer.nickname"
                    :size="24"
                    class="shrink-0"
                    :class="[playerAvatarClass(turnPlayer)]"
                  />
                </div>
              </div>
            </div>

            <div
              v-if="round.call"
              class="mx-4 mb-4 flex gap-2 items-center justify-center"
            >
              <span
                class="rounded-full shrink-0 h-2 w-2 ring-1"
                :class="[roundWinnerDotClass(round)]"
                aria-hidden="true"
              />
              <p class="text-compact color-base text-center min-w-0">
                <span class="font-medium">{{ t('ld.losesDie', { name: round.call.loser?.nickname ?? t('ld.loser') }) }}</span>
                —
                <span class="font-medium">
                  {{ round.call.correct
                    ? t('ld.wasHeld', { bidder: round.call.bidder?.nickname ?? t('ld.bidder'), count: round.call.count, face: round.call.face })
                    : t('ld.wasBluff', { bidder: round.call.bidder?.nickname ?? t('ld.bidder'), count: round.call.count, face: round.call.face }) }}
                </span>
                <template v-if="round.call.correct">
                  {{ t('ld.actualTotal', { count: round.call.total }) }}
                </template>
                <template v-else>
                  {{ t('ld.onlyFound', { count: round.call.total }) }}
                </template>
              </p>
            </div>
          </article>
        </div>
        <FeedbackEmptyState
          v-else
          icon="i-carbon-activity"
          :title="t('ld.noRounds')"
        />
      </div>
    </LayoutCard>
  </div>
</template>
