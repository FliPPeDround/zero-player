<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'

const open = ref(false)
// Remount the card on every open so rankings are always fetched fresh.
const openCount = ref(0)
const { t } = useAppI18n()

watch(open, (value) => {
  if (value)
    openCount.value += 1
})
</script>

<template>
  <OverlayModal
    v-model="open"
    :title="t('leaderboard.title')"
    :description="t('leaderboard.description')"
  >
    <template #trigger>
      <ActionIconButton
        icon="i-carbon-trophy"
        :tooltip="t('leaderboard.title')"
        :label="t('leaderboard.title')"
      />
    </template>
    <LeaderboardCard :key="openCount" />
  </OverlayModal>
</template>
