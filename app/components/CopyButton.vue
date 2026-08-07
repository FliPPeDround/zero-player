<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useClipboard } from '@vueuse/core'

const props = withDefaults(defineProps<{
  text: string
  label?: string
  tooltip?: string
}>(), {
  label: 'Copy',
  tooltip: 'Copy',
})

const { copy, copied } = useClipboard({
  source: () => props.text,
  copiedDuring: 1500,
  legacy: true,
})
</script>

<template>
  <ActionIconButton
    compact
    :icon="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'"
    :tooltip="copied ? 'Copied' : tooltip"
    :label="`${label} ${text}`"
    class="text-micro"
    @click="copy()"
  />
</template>
