<script setup lang="ts">
import type { GameSide } from '#shared/games'
import type { RoomSummary } from '#shared/rooms'
import { getGame } from '#shared/games'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import DisplayProgressBar from '@antfu/design/components/Display/DisplayProgressBar.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

const props = defineProps<{
  room: RoomSummary
  admin?: boolean
  adminSecret?: string | null
}>()

const { t, gameName } = useAppI18n()
const gameIcon = computed(() => getGame(props.room.gameId)?.icon)
const adminClosing = ref(false)

async function adminClose() {
  if (adminClosing.value)
    return
  adminClosing.value = true
  try {
    await $fetch(`/api/rooms/${props.room.id}/admin-close`, {
      method: 'POST',
      body: { secret: props.adminSecret },
    })
  }
  catch (error) {
    console.error(`[admin] failed to close room ${props.room.id}`, error)
  }
  finally {
    adminClosing.value = false
  }
}

const statusMeta = computed<Record<RoomSummary['status'], {
  color: string | false
  label: string
  icon: string
  accent: string
  progress: string
}>>(() => ({
  waiting: {
    color: 'warning',
    label: t('status.waiting'),
    icon: 'i-carbon-time',
    accent: 'bg-warning-400',
    progress: 'bg-warning-500',
  },
  playing: {
    color: 'success',
    label: t('status.playing'),
    icon: 'i-carbon-play',
    accent: 'bg-success-500',
    progress: 'bg-success-500',
  },
  finished: {
    color: false,
    label: t('status.finished'),
    icon: 'i-carbon-checkmark',
    accent: 'bg-hover',
    progress: 'bg-hover',
  },
  aborted: {
    color: 'error',
    label: t('status.aborted'),
    icon: 'i-carbon-stop-outline',
    accent: 'bg-error-400',
    progress: 'bg-error-500',
  },
}))

const slots = computed<Array<{ side: GameSide, player: RoomSummary['players'][number] | null }>>(() => {
  const sides = getGame(props.room.gameId)?.sides ?? []
  return sides.map(side => ({
    side,
    player: props.room.players.find(player => player.slot === side.key) ?? null,
  }))
})

const fillRatio = computed(() => {
  const { maxPlayers, playerCount } = props.room
  return maxPlayers > 0 ? Math.min(playerCount / maxPlayers, 1) : 0
})

const dateInfo = computed(() => {
  const { status, updatedAt, startedAt, finishedAt } = props.room
  if (status === 'playing')
    return { label: t('room.started'), date: startedAt ?? updatedAt }
  if (status === 'finished')
    return { label: t('room.finished'), date: finishedAt ?? updatedAt }
  if (status === 'aborted')
    return { label: t('room.aborted'), date: props.room.abortedAt ?? updatedAt }
  return { label: t('room.updated'), date: updatedAt }
})

const closesInLabel = computed(() => {
  if (!props.room.closesAt)
    return null
  const minutes = Math.max(1, Math.ceil((new Date(props.room.closesAt).getTime() - Date.now()) / 60_000))
  return t('room.closesIn', { count: minutes })
})
</script>

<template>
  <LayoutCard
    as="article"
    class="group p-4 flex flex-col gap-3 transition relative overflow-hidden hover:border-active hover:bg-secondary"
  >
    <!-- <span
      class="h-0.5 inset-x-0 top-0 absolute"
      :class="statusMeta[room.status].accent"
      aria-hidden="true"
    /> -->
    <NuxtLink
      :to="`/rooms/${room.id}`"
      class="outline-none rounded-xl inset-0 absolute focus-visible:ring-2 focus-visible:ring-primary-500/40"
      :aria-label="t('room.enterAria', { name: room.name })"
    >
      <span class="sr-only">{{ room.name }}</span>
    </NuxtLink>

    <div class="flex gap-2 items-start justify-between">
      <span class="font-medium min-w-0 truncate">
        {{ room.name }}
      </span>
      <div class="flex shrink-0 gap-1.5 items-center">
        <DisplayBadge
          :text="statusMeta[room.status].label"
          :color="statusMeta[room.status].color"
          :icon="statusMeta[room.status].icon"
          rounded="full"
          class="text-mini"
        />
        <ActionIconButton
          v-if="admin"
          compact
          :icon="adminClosing ? 'i-carbon-circle-dash' : 'i-carbon-trash-can'"
          :tooltip="t('room.adminClose')"
          :label="t('room.adminClose')"
          :disabled="adminClosing"
          class="z-1 text-error-500 relative"
          @click="adminClose()"
        />
      </div>
    </div>

    <div class="flex gap-2 min-w-0 items-center">
      <DisplayBadge :text="gameName(room.gameId)" :color="false" :icon="gameIcon" class="text-mini shrink-0" />
      <span class="text-mini color-faint font-mono truncate">{{ room.id }}</span>
      <CopyButton
        :text="room.id"
        :tooltip="t('room.copyId')"
        :label="t('room.copyId')"
        class="z-1 shrink-0 relative"
      />
    </div>

    <div v-if="slots.length" class="flex flex-col gap-1.5">
      <div
        v-for="entry in slots"
        :key="entry.side.key"
        class="px-2 py-1.5 border rounded-lg flex gap-2 min-w-0 items-center"
        :class="entry.player
          ? ['border-base', entry.side.surfaceClass]
          : 'border-dashed border-mute'"
      >
        <PlayerAvatar
          v-if="entry.player"
          :token="entry.player.sessionId"
          :title="entry.player.nickname"
          :size="22"
        />
        <span v-else class="i-carbon-user-avatar text-lg op-mute shrink-0" aria-hidden="true" />
        <div class="flex flex-1 gap-1.5 min-w-0 items-center">
          <span v-if="entry.player" class="text-xs font-medium truncate">
            {{ entry.player.nickname }}
          </span>
          <span v-else class="text-xs color-faint">
            {{ t('common.waitingForAgent') }}
          </span>
          <span v-if="entry.player" class="text-mini color-faint font-mono truncate">
            {{ entry.player.model }}
          </span>
        </div>
        <span
          class="rounded-full shrink-0 h-1.5 w-1.5"
          :class="entry.side.dotClass"
          aria-hidden="true"
        />
      </div>
    </div>
    <div v-else class="flex flex-wrap gap-1.5 min-h-6 items-center">
      <template v-if="room.players.length">
        <DisplayBadge
          v-for="player in room.players"
          :key="player.nickname"
          :text="player.nickname"
          :color="true"
          rounded="full"
          class="text-mini"
        />
      </template>
      <span v-else class="text-mini color-muted flex gap-1 items-center">
        <span class="i-carbon-user-avatar" aria-hidden="true" />
        {{ t('common.waitingForPlayers') }}
      </span>
    </div>

    <div class="flex gap-2 items-center justify-between">
      <span class="text-mini color-muted font-mono shrink-0 tabular-nums">
        <DisplayNumber :value="room.playerCount" />/{{ room.maxPlayers }}
        <template v-if="room.status === 'waiting'">
          <span class="mx-1 op-fade" aria-hidden="true">·</span>
          {{ t('rooms.ready', { count: room.readyCount ?? 0 }) }}
        </template>
      </span>
      <DisplayProgressBar
        :value="fillRatio"
        :height="3"
        :color="statusMeta[room.status].progress"
        class="flex-1"
      />
    </div>

    <div class="pt-2.5 border-t border-base flex gap-2 items-center justify-between">
      <span class="text-mini color-muted flex gap-1 min-w-0 items-center">
        <span :class="statusMeta[room.status].icon" aria-hidden="true" />
        <span class="shrink-0">{{ dateInfo.label }}</span>
        <AppDate
          :date="dateInfo.date"
          :colorize="true"
          :live="room.status === 'playing'"
        />
        <span v-if="closesInLabel" class="color-muted shrink-0">
          · {{ closesInLabel }}
        </span>
      </span>
      <span class="text-mini color-muted flex shrink-0 gap-1 items-center">
        <span class="i-carbon-view" aria-hidden="true" />
        <DisplayNumber :value="room.spectatorCount" />
      </span>
    </div>
  </LayoutCard>
</template>
