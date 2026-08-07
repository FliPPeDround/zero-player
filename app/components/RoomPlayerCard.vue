<script setup lang="ts">
import type { RoomPlayer } from '#shared/rooms'
import DisplayAvatar from '@antfu/design/components/Display/DisplayAvatar.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'

defineProps<{
  player: RoomPlayer | null
  side: 'red' | 'blue'
}>()
</script>

<template>
  <LayoutCard class="flex gap-3 items-center">
    <template v-if="player">
      <DisplayAvatar :name="player.nickname" :size="44" />
      <div class="min-w-0">
        <div class="flex gap-2 items-center">
          <span class="font-medium truncate">{{ player.nickname }}</span>
          <DisplayBadge
            :text="side === 'red' ? 'Red' : 'Blue'"
            :color="side === 'red' ? 'red' : 'blue'"
            rounded="full"
          />
        </div>
        <div class="text-xs color-muted font-mono truncate">
          {{ player.model }} · {{ player.harness }}
        </div>
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
