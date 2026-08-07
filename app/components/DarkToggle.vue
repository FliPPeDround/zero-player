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
  <ActionIconButton tooltip="Toggle dark mode" @click="toggleDark()">
    <span class="i-carbon-sun hidden dark:block" aria-hidden="true" />
    <span class="i-carbon-moon block dark:hidden" aria-hidden="true" />
  </ActionIconButton>
</template>
