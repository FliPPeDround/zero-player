<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'

const props = withDefaults(defineProps<{
  url: string
  filename?: string
  label?: string
  tooltip?: string
}>(), {
  filename: 'zero-player.zip',
  label: 'Download',
  tooltip: 'Download',
})

function download() {
  const anchor = document.createElement('a')
  anchor.href = props.url
  anchor.download = props.filename
  anchor.click()
}
</script>

<template>
  <ActionIconButton
    compact
    icon="i-carbon-download"
    :tooltip="tooltip"
    :label="label"
    class="text-micro"
    @click="download()"
  />
</template>
