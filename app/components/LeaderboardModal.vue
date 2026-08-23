<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'

// Omit the built-in trigger when the modal opens from elsewhere (e.g. HeaderMenu).
defineProps<{ hideTrigger?: boolean }>()
const open = defineModel<boolean>({ default: false })
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
    v-model:open="open"
    :title="t('leaderboard.title')"
    :description="t('leaderboard.description')"
  >
    <template v-if="!hideTrigger" #trigger>
      <ActionIconButton
        icon="i-carbon-trophy"
        :tooltip="t('leaderboard.title')"
        :label="t('leaderboard.title')"
      />
    </template>
    <LeaderboardCard :key="openCount" />
  </OverlayModal>
</template>
