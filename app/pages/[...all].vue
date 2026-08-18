<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import LayoutPanelGrids from '@antfu/design/components/Layout/LayoutPanelGrids.vue'

const { t } = useAppI18n()
</script>

<template>
  <LayoutPanelGrids variant="grid" :size="24" class="border border-base rounded-2xl bg-base">
    <FeedbackEmptyState icon="i-carbon-warning" :title="t('404.title')">
      <template #hint>
        {{ t('404.hint') }}
      </template>
      <template #actions>
        <ActionButton
          as="NuxtLink"
          to="/"
          icon="i-carbon-arrow-left"
          variant="primary"
        >
          {{ t('room.back') }}
        </ActionButton>
      </template>
    </FeedbackEmptyState>
  </LayoutPanelGrids>
</template>
