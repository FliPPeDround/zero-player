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

html,
body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none;
}

.side-avatar-black > span,
.side-avatar-white > span {
  border-radius: 9999px;
  overflow: hidden;
}

.side-avatar-black > span {
  background: #202124 !important;
  color: #f8f7f2 !important;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15);
}

.side-avatar-white > span {
  background: #f8f7f2 !important;
  color: #202124 !important;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
}

html.dark {
  color-scheme: dark;
}
</style>
