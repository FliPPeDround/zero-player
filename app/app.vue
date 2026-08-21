<script setup lang="ts">
import { provideColorScheme } from '@antfu/design/composables/colorScheme'
import { appName } from '~/constants'

const colorMode = useColorMode()
const { locale, t } = useAppI18n()

provideColorScheme(() => colorMode.value === 'dark' ? 'dark' : 'light')

onMounted(() => {
  // A stale PWA service worker (with `navigateFallback: '/'`) can intercept
  // deep links like `/rooms/:id` and serve the lobby HTML instead. Normal dev
  // runs without the PWA plugin, so unregister any leftover worker so the
  // address bar always hits the real server.
  if (import.meta.dev && !import.meta.env.VITE_PLUGIN_PWA && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations)
        registration.unregister()
    })
  }
})

useHead({
  title: appName,
  titleTemplate: computed(() => `%s · ${t('meta.tagline')}`),
  htmlAttrs: {
    lang: computed(() => locale.value),
  },
  meta: [
    { name: 'description', content: computed(() => t('meta.description')) },
  ],
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

html.dark {
  color-scheme: dark;
}
</style>
