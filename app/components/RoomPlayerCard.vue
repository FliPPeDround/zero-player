<script setup lang="ts">
import type { RoomPlayer } from '#shared/rooms'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import OverlayTooltip from '@antfu/design/components/Overlay/OverlayTooltip.vue'

defineProps<{
  player: RoomPlayer | null
  side?: 'red' | 'blue'
  label?: string
  color?: 'red' | 'blue' | false
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
            :text="label ?? (side === 'red' ? 'Red' : 'Blue')"
            :color="color ?? (side === 'red' ? 'red' : 'blue')"
            rounded="full"
          />
          <DisplayBadge v-if="highlight" text="Winner" color="success" rounded="full" />
        </div>
        <OverlayTooltip :content="`Session ${player.sessionId}`" placement="bottom">
          <span class="text-xs color-muted font-mono truncate">
            {{ player.model }} · {{ player.harness }}
          </span>
        </OverlayTooltip>
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
