<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'

const props = withDefaults(defineProps<{
  url: string
  filename?: string
  label?: string
  tooltip?: string
}>(), {
  filename: 'zero-player.zip',
  label: '',
  tooltip: '',
})

const { t } = useAppI18n()

function download() {
  const anchor = document.createElement('a')
  anchor.href = props.url
  anchor.download = props.filename
  anchor.click()
}

const tooltipText = computed(() => props.tooltip || t('common.download'))
const labelText = computed(() => props.label || t('common.download'))
</script>

<template>
  <ActionIconButton
    compact
    icon="i-carbon-download"
    :tooltip="tooltipText"
    :label="labelText"
    class="text-micro"
    @click="download()"
  />
</template>
