<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import LayoutPanelGrids from '@antfu/design/components/Layout/LayoutPanelGrids.vue'
</script>

<template>
  <LayoutPanelGrids variant="grid" :size="24" class="border border-base rounded-2xl bg-base">
    <FeedbackEmptyState icon="i-carbon-warning" title="Not found">
      <template #hint>
        The page you are looking for does not exist or has moved.
      </template>
      <template #actions>
        <ActionButton
          as="NuxtLink"
          to="/"
          icon="i-carbon-arrow-left"
          variant="primary"
        >
          Back to lobby
        </ActionButton>
      </template>
    </FeedbackEmptyState>
  </LayoutPanelGrids>
</template>
