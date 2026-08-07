<script setup lang="ts">
import { provideColorScheme } from '@antfu/design/composables/colorScheme'
import { appName } from '~/constants'

const colorMode = useColorMode()

provideColorScheme(() => colorMode.value === 'dark' ? 'dark' : 'light')

useHead({
  title: appName,
})
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
html,
body,
#__nuxt {
  height: 100vh;
  margin: 0;
  padding: 0;
}

html.dark {
  color-scheme: dark;
}
</style>
