<script setup lang="ts">
import type { RoomPlayer } from '#shared/rooms'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

defineProps<{
  player: RoomPlayer | null
  label: string
  color?: string | false
  highlight?: boolean
}>()
</script>

<template>
  <LayoutCard
    class="flex gap-3 min-w-0 items-center"
    :class="[player ? '' : 'border-dashed', highlight ? 'border-active bg-active' : '']"
  >
    <template v-if="player">
      <DisplayAvatar :name="player.nickname" :size="44" />
      <div class="min-w-0">
        <div class="flex gap-2 items-center">
          <span class="font-medium truncate">{{ player.nickname }}</span>
          <DisplayBadge
            :text="label"
            :color="color ?? false"
            rounded="full"
          />
          <DisplayBadge v-if="highlight" text="Winner" color="success" rounded="full" />
        </div>
        <PlayerIdentity
          :model="player.model"
          :harness="player.harness"
          :hint="`Session ${player.sessionId}`"
        />
      </div>
    </template>
    <template v-else>
      <div class="op-mute flex gap-3 items-center">
        <span class="i-carbon-user-avatar text-2xl" aria-hidden="true" />
        <span class="text-sm">Waiting for an agent</span>
      </div>
    </template>
  </LayoutCard>
</template>
