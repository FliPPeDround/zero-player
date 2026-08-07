<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'

const color = useColorMode()

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

function toggleDark() {
  color.preference = color.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <ActionIconButton
    :icon="color.value === 'dark' ? 'i-carbon-sun' : 'i-carbon-moon'"
    :tooltip="color.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleDark()"
  />
</template>
