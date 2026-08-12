<script setup lang="ts">
import OverlayTooltip from '@antfu/design/components/Overlay/OverlayTooltip.vue'

const props = withDefaults(defineProps<{
  model: string
  harness: string
  /** Extra tooltip text shown when the identity fits without truncation. */
  hint?: string
  /** Maximum displayed length; the full string is shown on hover when exceeded. */
  maxLength?: number
}>(), {
  maxLength: 56,
})

const full = computed(() => `${props.model} · ${props.harness}`)

const text = computed(() => {
  if (full.value.length <= props.maxLength)
    return full.value
  const cut = Math.max(0, props.maxLength - 1)
  return `${full.value.slice(0, cut).trimEnd()}…`
})

const truncated = computed(() => text.value !== full.value)

const tooltip = computed(() => (truncated.value ? full.value : props.hint ?? ''))
</script>

<template>
  <OverlayTooltip
    :content="tooltip"
    :disabled="!tooltip"
    placement="bottom"
    class="max-w-full min-w-0"
  >
    <span class="text-mini color-muted leading-tight font-mono block truncate">
      {{ text }}
    </span>
  </OverlayTooltip>
</template>
