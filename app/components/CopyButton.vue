<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { useClipboard } from '@vueuse/core'

const props = withDefaults(defineProps<{
  text: string
  label?: string
  tooltip?: string
}>(), {
  label: '',
  tooltip: '',
})

const { t } = useAppI18n()

const { copy, copied } = useClipboard({
  source: () => props.text,
  copiedDuring: 1500,
  legacy: true,
})

const tooltipText = computed(() => props.tooltip || t('common.copy'))
const labelText = computed(() => props.label || t('common.copy'))
</script>

<template>
  <ActionIconButton
    compact
    :icon="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'"
    :tooltip="copied ? t('common.copied') : tooltipText"
    :label="`${labelText} ${text}`"
    class="text-micro"
    @click="copy()"
  />
</template>
