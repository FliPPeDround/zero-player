<script setup lang="ts">
import type { TwentyFourState } from '#shared/24-point'
import type { GameSide } from '#shared/games'
import type { Room, RoomEvent, RoomPlayer } from '#shared/rooms'
import { TWENTY_FOUR_QUESTIONS } from '#shared/24-point'
import { getGame } from '#shared/games'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayDuration from '@antfu/design/components/Display/DisplayDuration.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const props = defineProps<{
  room: Room | null
}>()

const OPERATORS = ['+', '−', '×', '÷'] as const

interface TwentyFourPanel {
  side: GameSide
  player: RoomPlayer | null
  solved: number
  attempts: number
  currentNumbers: number[]
  currentQuestion: number
  viewedQuestion: number
  isCurrent: boolean
  events: RoomEvent[]
  accentClass: string
  badgeColor: 'primary'
}

const now = useNow({ interval: 1000 })
const selectedQuestion = ref<Record<string, number>>({})

const state = computed<TwentyFourState | null>(() => {
  const value = props.room?.game?.state
  if (!value || typeof value !== 'object')
    return null
  return value as TwentyFourState
})

const sides = computed<GameSide[]>(() => getGame(props.room?.gameId ?? '')?.sides ?? [])

const panels = computed<TwentyFourPanel[]>(() => (
  sides.value.map((side) => {
    const player = props.room?.players.find(item => item.slot === side.key) ?? null
    const solved = player ? (state.value?.progress[player.sessionId] ?? 0) : 0
    const attempts = player ? (state.value?.attempts[player.sessionId] ?? 0) : 0
    const puzzleCount = state.value?.puzzles.length ?? TWENTY_FOUR_QUESTIONS
    const currentQuestion = Math.min(solved + 1, puzzleCount)
    const viewedQuestion = selectedQuestion.value[side.key] ?? currentQuestion
    const viewedIndex = Math.min(viewedQuestion - 1, puzzleCount - 1)
    const events = player
      ? (props.room?.events ?? []).filter(event => (
          event.type === 'move'
          && event.payload?.side === side.key
          && event.payload?.question === viewedQuestion
        ))
      : []
    return {
      side,
      player,
      solved,
      attempts,
      currentNumbers: state.value?.puzzles[viewedIndex] ?? [],
      currentQuestion,
      viewedQuestion,
      isCurrent: viewedQuestion === currentQuestion,
      events,
      accentClass: 'bg-primary-500',
      badgeColor: 'primary',
    }
  })
))

function viewQuestion(sideKey: string, question: number): void {
  selectedQuestion.value[sideKey] = question
}

const elapsedMs = computed(() => {
  const startedAt = props.room?.startedAt ? new Date(props.room.startedAt).getTime() : 0
  if (!startedAt)
    return 0
  const endedAt = props.room?.finishedAt
    ? new Date(props.room.finishedAt).getTime()
    : now.value.getTime()
  return Math.max(0, endedAt - startedAt)
})

function questionDotClass(panel: TwentyFourPanel, question: number): string {
  if (question === panel.viewedQuestion)
    return `${panel.accentClass} ring-2 ring-primary-500/60`
  if (question <= panel.solved)
    return panel.accentClass
  if (question === panel.currentQuestion)
    return 'bg-active ring-1 ring-primary-500/40'
  return 'bg-hover'
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-x-3 gap-y-2 items-center justify-between">
      <div class="flex gap-2 min-w-0 items-center">
        <DisplayBadge
          icon="i-carbon-flag"
          text="Race"
          color="primary"
          rounded="full"
          class="shrink-0"
        />
        <span class="text-mini color-muted truncate">
          First to solve all three questions wins
        </span>
      </div>
      <span class="text-mini color-muted flex shrink-0 gap-1.5 items-center">
        <span class="i-carbon-time" aria-hidden="true" />
        <DisplayDuration :ms="elapsedMs" :colorize="true" />
      </span>
    </div>

    <div class="gap-4 grid items-stretch lg:grid-cols-2">
      <LayoutCard
        v-for="panel in panels"
        :key="panel.side.key"
        :padding="false"
        class="flex flex-col min-w-0 overflow-hidden"
      >
        <div class="px-4 py-3 border-b border-base flex gap-3 items-center justify-between">
          <div class="flex gap-2 min-w-0 items-center">
            <DisplayAvatar
              v-if="panel.player"
              :name="panel.player.nickname"
              :size="28"
              class="shrink-0"
              :class="[panel.side.avatarClass]"
            />
            <span
              v-else
              class="i-carbon-user-avatar text-lg op-fade shrink-0"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <div class="flex gap-1.5 min-w-0 items-center">
                <span class="text-sm leading-tight font-medium truncate">
                  {{ panel.player?.nickname ?? panel.side.label }}
                </span>
                <DisplayBadge
                  v-if="panel.player && room?.status === 'finished' && panel.player.sessionId === room.winner"
                  text="Winner"
                  color="success"
                  rounded="full"
                  class="shrink-0"
                />
              </div>
              <PlayerIdentity
                v-if="panel.player"
                :model="panel.player.model"
                :harness="panel.player.harness"
              />
              <div v-else class="text-mini color-muted leading-tight font-mono truncate">
                Waiting
              </div>
            </div>
          </div>
          <div v-if="panel.player" class="flex shrink-0 flex-col gap-1 items-end">
            <DisplayBadge
              :text="`Solved ${panel.solved}/${TWENTY_FOUR_QUESTIONS}`"
              :color="panel.solved >= TWENTY_FOUR_QUESTIONS ? 'success' : panel.badgeColor"
              rounded="full"
              class="text-mini"
            />
            <span class="text-mini color-faint font-mono">
              <DisplayNumber :value="panel.attempts" suffix=" attempts" />
            </span>
          </div>
        </div>

        <div class="p-4 flex flex-1 flex-col gap-4 min-w-0">
          <FeedbackEmptyState
            v-if="!panel.player"
            icon="i-carbon-user-avatar"
            title="Waiting for an agent"
            class="flex-1"
          />
          <template v-else>
            <div class="flex gap-2 items-center justify-between">
              <div class="flex gap-2 min-w-0 items-center">
                <span class="text-mini color-muted tracking-wide font-medium uppercase">
                  Question
                </span>
                <DisplayNumberBadge
                  :value="panel.viewedQuestion"
                  :color="panel.badgeColor"
                  class="shrink-0"
                />
                <span class="text-mini color-faint font-mono shrink-0">
                  / {{ TWENTY_FOUR_QUESTIONS }}
                </span>
              </div>
              <DisplayBadge
                :text="panel.solved >= TWENTY_FOUR_QUESTIONS
                  ? 'Done'
                  : panel.isCurrent ? 'Current' : 'Viewing'"
                :color="panel.solved >= TWENTY_FOUR_QUESTIONS
                  ? 'success'
                  : panel.isCurrent ? panel.badgeColor : false"
                rounded="full"
                class="text-mini shrink-0 w-20 justify-center"
              />
            </div>

            <div class="flex gap-1.5" aria-label="Question progress">
              <button
                v-for="question in TWENTY_FOUR_QUESTIONS"
                :key="question"
                type="button"
                class="rounded-full flex-1 h-2.5 cursor-pointer transition-all hover:op-80 focus-visible:ring-2 focus-visible:ring-primary-500/40"
                :class="questionDotClass(panel, question)"
                :aria-pressed="panel.viewedQuestion === question"
                :aria-label="`Show question ${question}`"
                @click="viewQuestion(panel.side.key, question)"
              />
            </div>

            <div class="bg-dots-20 p-4 border border-base rounded-2xl bg-secondary">
              <div class="gap-3 grid grid-cols-2">
                <div
                  v-for="(number, index) in panel.currentNumbers"
                  :key="index"
                  class="text-5xl font-mono font-semibold py-6 text-center border border-base rounded-xl bg-base tabular-nums"
                >
                  {{ number }}
                </div>
              </div>
              <div class="mt-4 flex gap-2 items-center justify-center">
                <span
                  v-for="operator in OPERATORS"
                  :key="operator"
                  class="text-lg color-muted font-mono border border-base rounded-lg bg-base grid h-10 w-10 place-items-center"
                >
                  {{ operator }}
                </span>
              </div>
            </div>

            <div class="border border-base rounded-xl flex flex-1 flex-col min-h-0 overflow-hidden">
              <div class="px-3 py-2 border-b border-base flex gap-2 items-center justify-between">
                <h3 class="text-sm font-medium flex gap-1.5 items-center">
                  <span class="i-carbon-list-boxes color-muted" aria-hidden="true" />
                  Attempt log
                  <DisplayBadge
                    :text="`Q${panel.viewedQuestion}`"
                    :color="false"
                    class="text-mini"
                  />
                </h3>
              </div>
              <div class="max-h-80 overflow-y-auto">
                <ol v-if="panel.events.length" class="py-1">
                  <li
                    v-for="(event, index) in panel.events"
                    :key="event.id"
                    class="px-3 py-2.5 border-t border-mute flex gap-3 items-start first:border-t-0"
                  >
                    <div class="flex shrink-0 flex-col gap-1.5 items-center">
                      <DisplayNumberBadge :value="index + 1" prefix="#" class="shrink-0" />
                      <DisplayBadge
                        :text="event.payload?.correct ? 'Correct' : 'Wrong'"
                        :color="event.payload?.correct ? 'success' : 'error'"
                        rounded="full"
                        class="text-mini shrink-0"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex gap-3 items-start justify-between">
                        <div class="text-sm font-medium font-mono min-w-0 break-words">
                          {{ event.payload?.expression ?? event.payload?.move }}
                        </div>
                        <DisplayDate
                          :date="event.at"
                          :live="room?.status === 'playing'"
                          class="text-mini color-faint mt-0.5 shrink-0"
                        />
                      </div>
                      <p
                        v-if="!event.payload?.correct && typeof event.payload?.feedback === 'string' && event.payload.feedback"
                        class="text-mini color-muted mt-1"
                      >
                        {{ event.payload.feedback }}
                      </p>
                      <p
                        v-if="typeof event.payload?.reason === 'string' && event.payload.reason"
                        class="text-compact color-muted mt-1 whitespace-pre-wrap break-words"
                      >
                        {{ event.payload.reason }}
                      </p>
                    </div>
                  </li>
                </ol>
                <FeedbackEmptyState
                  v-else
                  icon="i-carbon-activity"
                  title="No attempts yet"
                />
              </div>
            </div>
          </template>
        </div>
      </LayoutCard>
    </div>
  </div>
</template>
